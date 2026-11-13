import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_RECORDS_CONFIG } from '../src/config/records.js';
import { gameResultPlayers, gameResults, userStats, wallets } from '../src/db/schema.js';
import { deleteOldGameResults } from '../src/stats/service.js';
import { WalletService, type HandRecord } from '../src/wallet/service.js';
import { DAY, createTestServer, sessionCookie, validSignup, type TestServer } from './helpers.js';

let s: TestServer;
let wallet: WalletService;
beforeAll(async () => {
  s = await createTestServer();
  wallet = new WalletService(s.handle.db);
});
beforeEach(async () => {
  await s.reset();
});
afterAll(async () => {
  await s.close();
});

async function newUser(username: string, nickname: string): Promise<{ id: string; cookie: string }> {
  const res = await s.app.inject({ method: 'POST', url: '/api/auth/signup', payload: validSignup({ username, nickname }) });
  expect(res.statusCode).toBe(201);
  return { id: res.json().user.id, cookie: sessionCookie(res)!.value };
}

const get = (url: string, cookie?: string) => s.app.inject({ method: 'GET', url, ...(cookie ? { cookies: { sid: cookie } } : {}) });

let handSeq = 0;
const hand = (gameType: HandRecord['gameType'], deltas: Array<[id: string, delta: number, isBot?: boolean]>): HandRecord => ({
  gameId: `g-${++handSeq}`,
  gameType,
  roomId: 'room-1',
  participants: deltas.map(([id, chipDelta, isBot]) => ({ id, name: id, isBot: Boolean(isBot), chipDelta, finalChips: 1_000 + chipDelta })),
});

describe('내 전적', () => {
  it('판이 끝날 때 게임별로 판 수·승리·칩 증감·최고 획득이 쌓인다', async () => {
    const a = await newUser('player01', '하늘');
    const b = await newUser('player02', '바다');
    await wallet.recordHand(hand('holdem', [[a.id, 300], [b.id, -200], ['bot-1', -100, true]]));
    await wallet.recordHand(hand('holdem', [[a.id, -50], [b.id, 50]]));
    await wallet.recordHand(hand('hula', [[a.id, 120], [b.id, -120]]));

    const res = await get('/api/stats/me', a.cookie);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.perGame).toEqual([
      { gameType: 'stud7', played: 0, wins: 0, chipNet: 0, bestWin: 0 },
      { gameType: 'holdem', played: 2, wins: 1, chipNet: 250, bestWin: 300 },
      { gameType: 'hula', played: 1, wins: 1, chipNet: 120, bestWin: 120 },
    ]);
    expect(body.total).toEqual({ played: 3, wins: 2, chipNet: 370, bestWin: 300 });
    expect(body.recent).toHaveLength(3);
    expect(body.recent.find((r: { gameType: string }) => r.gameType === 'hula')).toMatchObject({ chipDelta: 120, rank: 1, players: 2 });
    // 봇이 포함된 판은 봇까지 인원으로 센다
    expect(body.recent.some((r: { players: number }) => r.players === 3)).toBe(true);
  });

  it('같은 판을 두 번 기록해도 전적은 한 번만 쌓인다', async () => {
    const a = await newUser('player01', '하늘');
    const record = hand('stud7', [[a.id, 500], ['bot-1', -500, true]]);
    expect(await wallet.recordHand(record)).toBe(true);
    expect(await wallet.recordHand(record)).toBe(false);
    const [row] = await s.handle.db.select().from(userStats).where(eq(userStats.userId, a.id));
    expect(row).toMatchObject({ played: 1, wins: 1, chipNet: 500 });
  });

  it('로그인하지 않으면 볼 수 없다', async () => {
    expect((await get('/api/stats/me')).statusCode).toBe(401);
    expect((await get('/api/ranking')).statusCode).toBe(401);
  });

  it('보관 기간이 지난 판별 기록은 지워져도 누적 전적은 남는다', async () => {
    const a = await newUser('player01', '하늘');
    await wallet.recordHand(hand('holdem', [[a.id, 100], ['bot-1', -100, true]]));
    await wallet.recordHand(hand('holdem', [[a.id, -40], ['bot-1', 40, true]]));
    const now = new Date();
    const old = new Date(now.getTime() - (DEFAULT_RECORDS_CONFIG.gameResultRetentionDays + 1) * DAY);
    await s.handle.db.update(gameResults).set({ endedAt: old }).where(eq(gameResults.gameId, `g-${handSeq - 1}`));

    expect(await deleteOldGameResults(s.handle.db, now, DEFAULT_RECORDS_CONFIG)).toBe(1);
    expect(await s.handle.db.select().from(gameResultPlayers).where(eq(gameResultPlayers.userId, a.id))).toHaveLength(1);
    const body = (await get('/api/stats/me', a.cookie)).json();
    expect(body.recent).toHaveLength(1);
    expect(body.perGame[1]).toMatchObject({ played: 2, wins: 1, chipNet: 60 });
  });
});

describe('칩 랭킹', () => {
  it('지갑과 테이블 칩을 합친 순서로, 같은 칩이면 같은 순위', async () => {
    const a = await newUser('player01', '하늘');
    const b = await newUser('player02', '바다');
    const c = await newUser('player03', '구름');
    await s.handle.db.update(wallets).set({ balance: 3_000 }).where(eq(wallets.userId, a.id));
    await s.handle.db.update(wallets).set({ balance: 20_000 }).where(eq(wallets.userId, b.id));
    // c: 지갑 10,000 중 8,000을 테이블에 → 합계 10,000
    await wallet.buyIn(c.id, 'room-1', 8_000, 1_000);
    await s.handle.db.update(wallets).set({ balance: 2_000 + 1_000 }).where(eq(wallets.userId, a.id));

    const body = (await get('/api/ranking', c.cookie)).json();
    expect(body.top.map((e: { nickname: string; chips: number; rank: number; isMe: boolean }) => [e.rank, e.nickname, e.chips, e.isMe])).toEqual([
      [1, '바다', 20_000, false],
      [2, '구름', 10_000, true],
      [3, '하늘', 3_000, false],
    ]);
    expect(body.me).toBeNull();

    await s.handle.db.update(wallets).set({ balance: 10_000 }).where(eq(wallets.userId, a.id));
    const tied = (await get('/api/ranking', a.cookie)).json();
    expect(tied.top.map((e: { rank: number }) => e.rank)).toEqual([1, 2, 2]);
  });

  it('상위 밖에 있으면 내 순위를 따로 알려 주고, 탈퇴한 사람은 빠진다', async () => {
    const small = await createTestServer({ records: { ...DEFAULT_RECORDS_CONFIG, rankingSize: 2 } });
    try {
      const make = async (username: string, nickname: string, balance: number) => {
        const res = await small.app.inject({ method: 'POST', url: '/api/auth/signup', payload: validSignup({ username, nickname }) });
        const id = res.json().user.id as string;
        await small.handle.db.update(wallets).set({ balance }).where(eq(wallets.userId, id));
        return { id, cookie: sessionCookie(res)!.value };
      };
      const top = await make('player01', '하늘', 50_000);
      await make('player02', '바다', 40_000);
      await make('player03', '구름', 30_000);
      const me = await make('player04', '별빛', 100);
      const body = (await small.app.inject({ method: 'GET', url: '/api/ranking', cookies: { sid: me.cookie } })).json();
      expect(body.top).toHaveLength(2);
      expect(body.me).toEqual({ rank: 4, nickname: '별빛', chips: 100, isMe: true });

      await small.app.inject({ method: 'POST', url: '/api/account/delete', cookies: { sid: top.cookie }, payload: { password: 'abcd1234' } });
      const after = (await small.app.inject({ method: 'GET', url: '/api/ranking', cookies: { sid: me.cookie } })).json();
      expect(after.top.map((e: { nickname: string }) => e.nickname)).toEqual(['바다', '구름']);
      expect(after.me.rank).toBe(3);
    } finally {
      await small.close();
    }
  });
});
