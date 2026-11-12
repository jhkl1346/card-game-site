import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_BASE } from './api.js';
import type { RoomSnapshot, RoomSummary } from './types.js';

export type AckResult<T = Record<string, unknown>> = ({ ok: true } & T) | { ok: false; error: string };

export type ConnectionState = 'connecting' | 'online' | 'reconnecting' | 'replaced' | 'unauthorized';

export interface Notice {
  id: number;
  message: string;
}

export interface GameSocket {
  state: ConnectionState;
  snapshot: RoomSnapshot | null;
  /** 스냅샷을 받은 순간의 (서버 시각 - 내 시각). 남은 시간 계산에 쓴다 */
  clockOffset: number;
  lobbyRooms: RoomSummary[];
  notices: Notice[];
  dismissNotice(id: number): void;
  pushNotice(message: string): void;
  emit<T = Record<string, unknown>>(event: string, payload?: unknown): Promise<AckResult<T>>;
  reconnect(): void;
}

let noticeSeq = 0;

/**
 * 로그인한 뒤 서버와 소켓을 연결한다. 세션 쿠키로 인증하며, 방 상태는 서버가 보내는 스냅샷만 믿는다.
 */
export function useGameSocket(enabled: boolean): GameSocket {
  const socketRef = useRef<Socket | null>(null);
  const [state, setState] = useState<ConnectionState>('connecting');
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const [lobbyRooms, setLobbyRooms] = useState<RoomSummary[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const lastSeq = useRef(-1);

  const pushNotice = useCallback((message: string) => {
    const id = ++noticeSeq;
    setNotices((list) => [...list.slice(-2), { id, message }]);
    setTimeout(() => setNotices((list) => list.filter((n) => n.id !== id)), 4_500);
  }, []);

  const connect = useCallback(() => {
    socketRef.current?.disconnect();
    lastSeq.current = -1;
    setState('connecting');
    const socket = io(API_BASE || undefined, { withCredentials: true, transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => setState('online'));
    socket.on('disconnect', (reason) => {
      if (reason === 'io server disconnect') return; // 서버가 끊은 경우는 아래 이벤트에서 이유를 받는다
      setState('reconnecting');
    });
    socket.io.on('reconnect_attempt', () => setState('reconnecting'));
    socket.on('connect_error', (err) => {
      if (err.message.includes('로그인')) setState('unauthorized');
      else setState('reconnecting');
    });
    socket.on('session:replaced', () => setState('replaced'));
    socket.on('room:snapshot', (snap: RoomSnapshot | null) => {
      // 방에 없으면 서버는 null을 보낸다 → 로비 화면
      if (!snap || !snap.room) {
        lastSeq.current = -1;
        snapshotRoomId.current = null;
        setSnapshot(snap);
        return;
      }
      // 늦게 도착한 옛 스냅샷은 버린다 (방이 바뀌면 seq가 처음부터 다시 시작)
      if (snap.seq < lastSeq.current && snapshotRoomId.current === snap.room.id) return;
      lastSeq.current = snap.seq;
      snapshotRoomId.current = snap.room.id;
      setClockOffset(snap.serverNow - Date.now());
      setSnapshot(snap);
    });
    socket.on('lobby:rooms', (rooms: RoomSummary[]) => setLobbyRooms(rooms));
    socket.on('server:notice', ({ message }: { message: string }) => pushNotice(message));
  }, [pushNotice]);

  const snapshotRoomId = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    connect();
    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [enabled, connect]);

  const emit = useCallback(<T,>(event: string, payload?: unknown) => {
    const socket = socketRef.current;
    if (!socket?.connected) {
      return Promise.resolve({ ok: false, error: '서버와 연결되어 있지 않습니다. 잠시 후 다시 시도해 주세요.' } as AckResult<T>);
    }
    return new Promise<AckResult<T>>((resolve) => {
      socket.timeout(10_000).emit(event, payload ?? {}, (err: Error | null, res: AckResult<T>) => {
        resolve(err ? { ok: false, error: '응답이 늦어지고 있습니다. 잠시 후 다시 시도해 주세요.' } : res);
      });
    });
  }, []);

  const dismissNotice = useCallback((id: number) => setNotices((list) => list.filter((n) => n.id !== id)), []);

  return { state, snapshot, clockOffset, lobbyRooms, notices, dismissNotice, pushNotice, emit, reconnect: connect };
}
