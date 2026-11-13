import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { ZodError, z } from 'zod';
import { findSession } from '../auth/sessions.js';
import type { AuthContext } from '../auth/service.js';
import type { ServerLimits } from '../config/limits.js';
import type { RoomManager, RoomUser } from '../rooms/manager.js';
import { maskBannedWords } from '../auth/banned-words.js';
import { RoomError, type GameRoom } from '../rooms/room.js';

/** 클라이언트 → 서버 요청의 응답 형식 */
export type Ack = (response: { ok: true; [key: string]: unknown } | { ok: false; error: string }) => void;

interface SocketData {
  user: RoomUser;
  sessionId: string;
  /** 같은 계정의 새 접속으로 밀려남 (끊길 때 방 접속 끊김 처리를 하지 않는다) */
  replaced?: boolean;
}

type AppSocket = Socket & { data: SocketData };

export interface SocketLayer {
  io: Server;
  /** 이 사용자의 소켓을 끊는다 (keepSessionId 세션의 소켓은 남긴다) */
  disconnectUser(userId: string, message: string, keepSessionId?: string): void;
  roomChanged(room: GameRoom): void;
  roomClosed(room: GameRoom, memberIds: string[]): void;
  lobbyChanged(): void;
  notice(userId: string, message: string): void;
  memberLeft(room: GameRoom, userId: string): void;
  /** 닉네임이 바뀜: 연결된 소켓이 들고 있는 닉네임도 바꾼다 */
  renameUser(userId: string, nickname: string): void;
}

export interface SocketOptions {
  httpServer: HttpServer;
  auth: AuthContext;
  parseCookie(header: string): Record<string, string | undefined>;
  limits: ServerLimits;
  /** RoomManager는 소켓 계층의 이벤트를 받아야 해서 나중에 연결한다 */
  rooms: () => RoomManager;
  logError(message: string, error: unknown): void;
}

const roomChannel = (roomId: string) => `room:${roomId}`;

const joinSchema = z.object({ roomId: z.string().max(64).optional(), code: z.string().max(12).optional(), spectate: z.boolean().optional() });
const userTargetSchema = z.object({ userId: z.string().max(64) });
const gameTypeSchema = z.object({ gameType: z.string().max(16), settings: z.record(z.string(), z.unknown()).optional() });
const chatSchema = z.object({ text: z.string() });

/**
 * Socket.IO 계층.
 * - 연결할 때 세션 쿠키로 인증한다 (로그인하지 않으면 연결 거부).
 * - 같은 계정이 새로 연결하면 기존 소켓에 session:replaced를 보내고 끊는다. 앉아 있던 자리는 새 소켓이 이어받는다.
 * - 방 상태가 바뀌면 방 안의 사람마다 그 사람의 시야로 만든 스냅샷을 따로 보낸다 (남의 비공개 카드는 보내지 않음).
 * - 요청 빈도 제한, 차례가 아닌 사람의 액션 거절은 서버에서 한다.
 */
export function createSocketLayer(options: SocketOptions): SocketLayer {
  const { limits } = options;
  const io = new Server(options.httpServer, {
    serveClient: false,
    maxHttpBufferSize: 16 * 1024,
    // 같은 도메인 구성 기준. 개발 중에는 Vite 프록시를 거친다
    cors: undefined,
  });
  const userSockets = new Map<string, AppSocket>();
  const lastChatAt = new Map<string, number>();

  io.use(async (socket, next) => {
    try {
      const cookies = options.parseCookie(socket.request.headers.cookie ?? '');
      const token = cookies[options.auth.config.cookieName];
      const session = token ? await findSession(options.auth.db, token, options.auth.now(), options.auth.config) : null;
      if (!session) return next(new Error('로그인이 필요합니다.'));
      const data = socket.data as SocketData;
      data.user = { userId: session.userId, nickname: session.nickname };
      data.sessionId = session.sessionId;
      next();
    } catch (error) {
      options.logError('소켓 인증 실패', error);
      next(new Error('서버 오류가 발생했습니다.'));
    }
  });

  const sendSnapshot = (socket: AppSocket) => {
    const snapshot = options.rooms().snapshotFor(socket.data.user.userId);
    socket.emit('room:snapshot', snapshot);
  };

  const layer: SocketLayer = {
    io,
    disconnectUser(userId, message, keepSessionId) {
      const socket = userSockets.get(userId);
      if (!socket || socket.data.sessionId === keepSessionId) return;
      socket.data.replaced = true;
      userSockets.delete(userId);
      socket.emit('session:replaced', { message });
      socket.disconnect(true);
      void options.rooms().setConnected(userId, false).catch((e) => options.logError('접속 상태 변경 실패', e));
    },
    roomChanged(room) {
      for (const userId of room.humanIds()) {
        const socket = userSockets.get(userId);
        if (!socket) continue;
        void socket.join(roomChannel(room.id));
        socket.emit('room:snapshot', room.snapshotFor(userId));
      }
    },
    roomClosed(room) {
      io.in(roomChannel(room.id)).socketsLeave(roomChannel(room.id));
    },
    lobbyChanged: debounce(() => {
      io.to('lobby').emit('lobby:rooms', options.rooms().listPublic());
    }, 300),
    renameUser(userId, nickname) {
      const socket = userSockets.get(userId);
      if (socket) socket.data.user = { ...socket.data.user, nickname };
    },
    notice(userId, message) {
      userSockets.get(userId)?.emit('server:notice', { message });
    },
    memberLeft(room, userId) {
      const socket = userSockets.get(userId);
      if (!socket) return;
      void socket.leave(roomChannel(room.id));
      sendSnapshot(socket);
    },
  };

  io.on('connection', (rawSocket) => {
    const socket = rawSocket as AppSocket;
    const { userId } = socket.data.user;

    // 같은 계정의 기존 접속은 끊는다
    const previous = userSockets.get(userId);
    if (previous && previous.id !== socket.id) {
      previous.data.replaced = true;
      previous.emit('session:replaced', { message: '다른 곳에서 로그인되어 접속을 종료합니다.' });
      previous.disconnect(true);
    }
    userSockets.set(userId, socket);

    // 진행 중이던 방이 있으면 자동으로 복귀한다
    const rooms = options.rooms();
    const room = rooms.roomOf(userId);
    if (room) {
      void socket.join(roomChannel(room.id));
      void rooms.setConnected(userId, true).then(() => sendSnapshot(socket));
    } else {
      sendSnapshot(socket);
    }

    // 요청 빈도 제한 (토큰 버킷)
    let tokens = limits.socketEventsPerSecond * 2;
    let refilledAt = Date.now();
    const allow = () => {
      const now = Date.now();
      tokens = Math.min(limits.socketEventsPerSecond * 2, tokens + ((now - refilledAt) / 1000) * limits.socketEventsPerSecond);
      refilledAt = now;
      if (tokens < 1) return false;
      tokens -= 1;
      return true;
    };

    /** 이벤트 처리기: 빈도 제한, 오류를 한국어 응답으로 바꾸기 */
    const on = (event: string, handler: (payload: unknown) => Promise<Record<string, unknown> | void>) => {
      socket.on(event, async (payload: unknown, ack?: unknown) => {
        const reply: Ack = typeof ack === 'function' ? (ack as Ack) : () => undefined;
        if (!allow()) return reply({ ok: false, error: '요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.' });
        try {
          const result = await handler(payload);
          reply({ ok: true, ...(result ?? {}) });
        } catch (error) {
          if (error instanceof RoomError) return reply({ ok: false, error: error.message });
          if (error instanceof ZodError) return reply({ ok: false, error: error.issues[0]?.message ?? '요청 형식이 올바르지 않습니다.' });
          options.logError(`소켓 요청 처리 실패: ${event}`, error);
          reply({ ok: false, error: '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' });
        }
      });
    };

    const user = () => socket.data.user;
    const joined = (room: GameRoom) => {
      void socket.join(roomChannel(room.id));
      sendSnapshot(socket);
      return { roomId: room.id };
    };

    on('lobby:subscribe', async () => {
      void socket.join('lobby');
      return { rooms: options.rooms().listPublic() };
    });
    on('lobby:unsubscribe', async () => {
      void socket.leave('lobby');
    });
    on('room:create', async (payload) => joined(await options.rooms().create(user(), payload)));
    on('room:single', async (payload) => {
      const { gameType, settings } = gameTypeSchema.parse(payload);
      return joined(await options.rooms().createSingle(user(), gameType, settings));
    });
    on('room:join', async (payload) => {
      const { roomId, code, spectate } = joinSchema.parse(payload);
      return joined(await options.rooms().join(user(), { ...(roomId ? { roomId } : {}), ...(code ? { code } : {}) }, spectate ?? false));
    });
    on('room:quickJoin', async (payload) => joined(await options.rooms().quickJoin(user(), gameTypeSchema.parse(payload).gameType)));
    on('room:sit', async () => {
      await options.rooms().sit(user());
    });
    on('room:leave', async () => {
      const room = options.rooms().roomOf(userId);
      const returned = await options.rooms().leave(userId);
      if (room && !room.hasMember(userId)) void socket.leave(roomChannel(room.id));
      sendSnapshot(socket);
      return { returned, pending: returned === null };
    });
    on('room:start', async () => {
      await options.rooms().start(userId);
    });
    on('room:kick', async (payload) => {
      const { userId: target } = userTargetSchema.parse(payload);
      await options.rooms().kick(userId, target);
      const targetSocket = userSockets.get(target);
      if (targetSocket) sendSnapshot(targetSocket);
    });
    on('room:transferHost', async (payload) => {
      await options.rooms().transferHost(userId, userTargetSchema.parse(payload).userId);
    });
    on('room:resync', async () => {
      sendSnapshot(socket);
    });
    on('game:action', async (payload) => {
      const { action } = z.object({ action: z.unknown() }).parse(payload);
      await options.rooms().act(userId, action);
    });
    on('chat:send', async (payload) => {
      const room = options.rooms().roomOf(userId);
      if (!room) throw new RoomError('방에 있을 때만 채팅할 수 있습니다.');
      const text = maskBannedWords(chatSchema.parse(payload).text.trim());
      if (!text) throw new RoomError('메시지를 입력해 주세요.');
      if (Array.from(text).length > limits.chatMaxLength) throw new RoomError(`채팅은 ${limits.chatMaxLength}자까지 보낼 수 있습니다.`);
      const now = Date.now();
      if (now - (lastChatAt.get(userId) ?? 0) < limits.chatMinIntervalMs) throw new RoomError('채팅을 너무 빨리 보내고 있습니다.');
      lastChatAt.set(userId, now);
      // 채팅은 DB에 저장하지 않는다. 화면에서는 React가 글자를 그대로 이스케이프해서 보여 준다
      io.to(roomChannel(room.id)).emit('chat:message', { userId, nickname: user().nickname, text, at: now });
    });

    socket.on('disconnect', () => {
      if (socket.data.replaced) return;
      if (userSockets.get(userId) === socket) userSockets.delete(userId);
      lastChatAt.delete(userId);
      void options.rooms().setConnected(userId, false).catch((e) => options.logError('접속 상태 변경 실패', e));
    });
  });

  return layer;
}

function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, ms);
  };
}
