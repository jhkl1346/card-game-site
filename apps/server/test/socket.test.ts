import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestServer, sessionCookie, validSignup, type TestServer } from './helpers.js';

let s: TestServer;
let url: string;
const sockets: Socket[] = [];

beforeAll(async () => {
  s = await createTestServer();
  await s.app.listen({ port: 0, host: '127.0.0.1' });
  url = `http://127.0.0.1:${(s.app.server.address() as AddressInfo).port}`;
});
beforeEach(async () => {
  for (const socket of sockets.splice(0)) socket.disconnect();
  await s.bundle.rooms.shutdown();
  await s.reset();
});
afterAll(async () => {
  for (const socket of sockets) socket.disconnect();
  await s.close();
});

async function signup(username: string, nickname: string): Promise<{ id: string; cookie: string }> {
  const res = await s.app.inject({ method: 'POST', url: '/api/auth/signup', payload: validSignup({ username, nickname }) });
  expect(res.statusCode).toBe(201);
  return { id: res.json().user.id, cookie: `sid=${sessionCookie(res)!.value}` };
}

/** 소켓을 열고, 받은 모든 이벤트를 원본 JSON으로 기록한다 (네트워크로 무엇이 오갔는지 검사용) */
function open(cookie?: string): Promise<{ socket: Socket; received: Array<{ event: string; json: string }> }> {
  const socket = connect(url, { transports: ['websocket'], forceNew: true, reconnection: false, ...(cookie ? { extraHeaders: { cookie } } : {}) });
  sockets.push(socket);
  const received: Array<{ event: string; json: string }> = [];
  socket.onAny((event, payload) => received.push({ event, json: JSON.stringify(payload) }));
  return new Promise((resolve, reject) => {
    socket.on('connect', () => resolve({ socket, received }));
    socket.on('connect_error', (err) => reject(err));
  });
}

function request<T = Record<string, unknown>>(socket: Socket, event: string, payload: unknown = {}): Promise<T & { ok: boolean; error?: string }> {
  return socket.timeout(5_000).emitWithAck(event, payload);
}

const waitFor = async (check: () => boolean, ms = 5_000) => {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('시간 초과');
    await new Promise((r) => setTimeout(r, 20));
  }
};

describe('Socket.IO', () => {
  it('로그인하지 않으면 연결이 거부된다', async () => {
    await expect(open()).rejects.toThrow('로그인이 필요합니다.');
    await expect(open('sid=forged-token')).rejects.toThrow('로그인이 필요합니다.');
  });

  it('두 사람이 같은 홀덤 방에서 각자 자기 카드만 받는다 (상대 카드·덱·번 카드는 네트워크로 오지 않음)', async () => {
    const a = await signup('player01', '하늘');
    const b = await signup('player02', '바다');
    const ca = await open(a.cookie);
    const cb = await open(b.cookie);

    const created = await request<{ roomId: string }>(ca.socket, 'room:create', { gameType: 'holdem', maxPlayers: 2, botCount: 0, turnSeconds: 60 });
    expect(created.ok).toBe(true);
    const lobby = await request<{ rooms: Array<{ id: string }> }>(cb.socket, 'lobby:subscribe');
    expect(lobby.rooms.map((r) => r.id)).toContain(created.roomId);
    expect((await request(cb.socket, 'room:join', { roomId: created.roomId })).ok).toBe(true);
    expect((await request(cb.socket, 'room:start')).error).toBe('방장만 게임을 시작할 수 있습니다.');
    expect((await request(ca.socket, 'room:start')).ok).toBe(true);

    const lastGame = (r: Array<{ event: string; json: string }>) => {
      const snaps = r.filter((x) => x.event === 'room:snapshot').map((x) => JSON.parse(x.json));
      return snaps.at(-1)?.game as { players: Array<{ id: string; hole: Array<unknown> }> } | null;
    };
    await waitFor(() => !!lastGame(ca.received) && !!lastGame(cb.received));
    for (const [mine, theirs, received] of [
      [a.id, b.id, ca.received],
      [b.id, a.id, cb.received],
    ] as const) {
      const game = lastGame(received)!;
      expect(game.players.find((p) => p.id === mine)!.hole.every((c) => c !== null)).toBe(true);
      expect(game.players.find((p) => p.id === theirs)!.hole).toEqual([null, null]);
      const everything = received.map((x) => x.json).join('\n');
      expect(everything).not.toContain('"deck":');
      expect(everything).not.toContain('burnedCards');
    }

    // 차례가 아닌 사람의 액션은 거절
    const snap = JSON.parse(ca.received.filter((x) => x.event === 'room:snapshot').at(-1)!.json);
    const actor: string = snap.turn.actorId;
    const [actorSocket, waitingSocket] = actor === a.id ? [ca.socket, cb.socket] : [cb.socket, ca.socket];
    expect((await request(waitingSocket, 'game:action', { action: { type: 'fold' } })).error).toBe('내 차례가 아닙니다.');
    expect((await request(actorSocket, 'game:action', { action: { type: 'fold' } })).ok).toBe(true);
    // 판이 끝나면 결과가 기록된다
    await waitFor(() => lastGame(ca.received) !== null && JSON.parse(ca.received.filter((x) => x.event === 'room:snapshot').at(-1)!.json).game.result !== null);
  });

  it('같은 계정으로 다시 접속하면 기존 접속에 안내 후 끊고, 방으로 자동 복귀한다', async () => {
    const a = await signup('player01', '하늘');
    const first = await open(a.cookie);
    expect((await request(first.socket, 'room:single', { gameType: 'hula' })).ok).toBe(true);
    const disconnected = new Promise<void>((resolve) => first.socket.on('disconnect', () => resolve()));

    const second = await open(a.cookie);
    await disconnected;
    expect(first.received.find((x) => x.event === 'session:replaced')!.json).toContain('다른 곳에서 로그인');
    await waitFor(() => second.received.some((x) => x.event === 'room:snapshot' && JSON.parse(x.json)?.me?.seatIndex === 0));
    expect(s.bundle.rooms.roomOf(a.id)!.seatOf(a.id)!.connected).toBe(true);
  });

  it('다른 곳에서 HTTP로 로그인하면 기존 소켓이 끊긴다', async () => {
    const a = await signup('player01', '하늘');
    const first = await open(a.cookie);
    const disconnected = new Promise<void>((resolve) => first.socket.on('disconnect', () => resolve()));
    await s.app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'player01', password: 'abcd1234' } });
    await disconnected;
    expect(first.received.some((x) => x.event === 'session:replaced')).toBe(true);
  });

  it('채팅: 같은 방에만 전달되고 길이·빈도 제한이 있다', async () => {
    const a = await signup('player01', '하늘');
    const b = await signup('player02', '바다');
    const ca = await open(a.cookie);
    const cb = await open(b.cookie);
    expect((await request(ca.socket, 'chat:send', { text: '안녕' })).error).toContain('방에 있을 때만');
    const { roomId } = await request<{ roomId: string }>(ca.socket, 'room:create', { gameType: 'hula', botCount: 0 });
    await request(cb.socket, 'room:join', { roomId, spectate: true });
    expect((await request(ca.socket, 'chat:send', { text: '<b>안녕</b>' })).ok).toBe(true);
    expect((await request(ca.socket, 'chat:send', { text: '또' })).error).toContain('너무 빨리');
    expect((await request(cb.socket, 'chat:send', { text: 'x'.repeat(201) })).error).toContain('200자');
    await waitFor(() => cb.received.some((x) => x.event === 'chat:message'));
    expect(JSON.parse(cb.received.find((x) => x.event === 'chat:message')!.json)).toMatchObject({ nickname: '하늘', text: '<b>안녕</b>' });
  });

  it('채팅은 거르지 않고 그대로 전달된다 (지인끼리 쓰는 용도)', async () => {
    const a = await signup('player01', '하늘');
    const ca = await open(a.cookie);
    await request(ca.socket, 'room:create', { gameType: 'hula', botCount: 1 });
    expect((await request(ca.socket, 'chat:send', { text: '아 씨발' })).ok).toBe(true);
    await waitFor(() => ca.received.some((x) => x.event === 'chat:message'));
    expect(JSON.parse(ca.received.find((x) => x.event === 'chat:message')!.json).text).toBe('아 씨발');
  });

  it('닉네임은 방 밖에서만 바꿀 수 있고, 바꾸면 채팅에도 새 닉네임이 쓰인다', async () => {
    const a = await signup('player01', '하늘');
    const ca = await open(a.cookie);
    const { roomId } = await request<{ roomId: string }>(ca.socket, 'room:create', { gameType: 'hula', botCount: 1 });
    expect(roomId).toBeTruthy();
    const blocked = await s.app.inject({ method: 'PATCH', url: '/api/account/nickname', headers: { cookie: a.cookie }, payload: { nickname: '노을' } });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error).toContain('방에서 나온 뒤');

    await request(ca.socket, 'room:leave');
    const changed = await s.app.inject({ method: 'PATCH', url: '/api/account/nickname', headers: { cookie: a.cookie }, payload: { nickname: '노을' } });
    expect(changed.statusCode).toBe(200);
    await request(ca.socket, 'room:create', { gameType: 'hula', botCount: 1 });
    expect((await request(ca.socket, 'chat:send', { text: '안녕' })).ok).toBe(true);
    await waitFor(() => ca.received.some((x) => x.event === 'chat:message'));
    expect(JSON.parse(ca.received.find((x) => x.event === 'chat:message')!.json).nickname).toBe('노을');
  });

  it('요청이 너무 잦으면 거절된다', async () => {
    const a = await signup('player01', '하늘');
    const ca = await open(a.cookie);
    const results = await Promise.all(Array.from({ length: 40 }, () => request(ca.socket, 'room:resync')));
    expect(results.some((r) => r.error?.includes('너무 잦습니다'))).toBe(true);
  });
});
