import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RELIEF_CHIP_CONFIG } from '../src/config/auth.js';
import { chipLogs, gameResultPlayers, gameResults, tableStakes, users, wallets } from '../src/db/schema.js';
import { WalletError, WalletService } from '../src/wallet/service.js';
import { createTestServer, sessionCookie, validSignup, type TestServer } from './helpers.js';

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

async function newUser(username = 'player01', nickname = '하늘'): Promise<{ id: string; cookie: string }> {
  const res = await s.app.inject({ method: 'POST', url: '/api/auth/signup', payload: validSignup({ username, nickname }) });
  expect(res.statusCode).toBe(201);
  return { id: res.json().user.id, cookie: sessionCookie(res)!.value };
}

const setBalance = (userId: string, balance: number) => s.handle.db.update(wallets).set({ balance }).where(eq(wallets.userId, userId));
const reliefLogs = async (userId: string) =>
  (await s.handle.db.select().from(chipLogs).where(eq(chipLogs.userId, userId))).filter((l) => l.reason === 'relief');

describe('구제 칩', () => {
  it('잔액이 정확히 0이면 지급된다', async () => {
    const { id } = await newUser();
    await setBalance(id, 0);
    expect(await wallet.claimRelief(id, 0, RELIEF_CHIP_CONFIG)).toBe(5_000);
    expect(await wallet.getBalance(id)).toBe(5_000);
    expect(await reliefLogs(id)).toHaveLength(1);
  });

  it('잔액이 1개라도 있으면 거절된다', async () => {
    const { id } = await newUser();
    await setBalance(id, 1);
    await expect(wallet.claimRelief(id, 0, RELIEF_CHIP_CONFIG)).rejects.toThrow(WalletError);
    expect(await wallet.getBalance(id)).toBe(1);
    expect(await reliefLogs(id)).toHaveLength(0);
  });

  it('바이인으로 잔액이 0이어도 테이블에 칩이 남아 있으면 거절된다', async () => {
    const { id } = await newUser();
    await wallet.buyIn(id, 'room-1', 10_000, 1_000);
    expect(await wallet.getBalance(id)).toBe(0);
    // 방 관리자가 알려 준 지금 테이블 칩이 있을 때
    await expect(wallet.claimRelief(id, 7_000, RELIEF_CHIP_CONFIG)).rejects.toThrow('테이블에 칩이 남아');
    // 메모리 값이 0이어도 DB의 테이블 칩(table_stakes)이 남아 있으면
    await expect(wallet.claimRelief(id, 0, RELIEF_CHIP_CONFIG)).rejects.toThrow('테이블에 칩이 남아');
    expect(await reliefLogs(id)).toHaveLength(0);
  });

  it('동시에 2번 요청해도 1번만 지급된다', async () => {
    const { id } = await newUser();
    await setBalance(id, 0);
    const results = await Promise.allSettled([
      wallet.claimRelief(id, 0, RELIEF_CHIP_CONFIG),
      wallet.claimRelief(id, 0, RELIEF_CHIP_CONFIG),
      wallet.claimRelief(id, 0, RELIEF_CHIP_CONFIG),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await wallet.getBalance(id)).toBe(5_000);
    expect(await reliefLogs(id)).toHaveLength(1);
  });

  it('0이 될 때마다 횟수 제한 없이 반복해서 받을 수 있다', async () => {
    const { id } = await newUser();
    for (let i = 1; i <= 5; i++) {
      await setBalance(id, 0);
      await wallet.claimRelief(id, 0, RELIEF_CHIP_CONFIG);
      expect(await wallet.getBalance(id)).toBe(5_000);
      expect(await reliefLogs(id)).toHaveLength(i);
    }
  });

  it('API: 잔액이 있으면 409, 0이면 지급, /api/wallet이 버튼 표시 여부를 알려 준다', async () => {
    const { id, cookie } = await newUser();
    const info = await s.app.inject({ method: 'GET', url: '/api/wallet', cookies: { sid: cookie } });
    expect(info.json()).toMatchObject({ balance: 10_000, tableChips: 0, canClaimRelief: false, reliefAmount: 5_000 });
    const denied = await s.app.inject({ method: 'POST', url: '/api/wallet/relief', cookies: { sid: cookie } });
    expect(denied.statusCode).toBe(409);
    expect(denied.json().error).toContain('0개일 때만');

    await setBalance(id, 0);
    expect((await s.app.inject({ method: 'GET', url: '/api/wallet', cookies: { sid: cookie } })).json().canClaimRelief).toBe(true);
    const ok = await s.app.inject({ method: 'POST', url: '/api/wallet/relief', cookies: { sid: cookie } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ amount: 5_000, balance: 5_000 });
    expect((await s.app.inject({ method: 'POST', url: '/api/wallet/relief' })).statusCode).toBe(401);
  });
});

describe('바이인과 정산', () => {
  it('바이인: 잔액이 부족하면 가진 만큼 앉고, 최소 금액보다 적으면 거절', async () => {
    const { id } = await newUser();
    await setBalance(id, 3_000);
    expect(await wallet.buyIn(id, 'room-1', 5_000, 1_000)).toBe(3_000);
    expect(await wallet.getBalance(id)).toBe(0);

    const other = await newUser('player02', '바다');
    await setBalance(other.id, 500);
    await expect(wallet.buyIn(other.id, 'room-1', 5_000, 1_000)).rejects.toThrow('칩이 부족합니다');
    expect(await wallet.getBalance(other.id)).toBe(500);
  });

  it('한 사람은 한 방에만 앉을 수 있다', async () => {
    const { id } = await newUser();
    await wallet.buyIn(id, 'room-1', 2_000, 1_000);
    await expect(wallet.buyIn(id, 'room-2', 2_000, 1_000)).rejects.toThrow('이미 다른 방');
    expect(await wallet.getBalance(id)).toBe(8_000);
  });

  it('판 결과는 한 번만 기록되고(같은 gameId 중복 정산 방지), 일어날 때 최신 테이블 칩이 돌아온다', async () => {
    const a = await newUser();
    const b = await newUser('player02', '바다');
    await wallet.buyIn(a.id, 'room-1', 5_000, 1_000);
    await wallet.buyIn(b.id, 'room-1', 5_000, 1_000);
    const record = {
      gameId: 'game-1',
      gameType: 'holdem' as const,
      roomId: 'room-1',
      participants: [
        { id: a.id, name: '하늘', isBot: false, chipDelta: 1_200, finalChips: 6_200 },
        { id: b.id, name: '바다', isBot: false, chipDelta: -800, finalChips: 4_200 },
        { id: 'bot:x:0', name: '하늘봇', isBot: true, chipDelta: -400, finalChips: 4_600 },
      ],
    };
    expect(await wallet.recordHand(record)).toBe(true);
    expect(await wallet.recordHand(record)).toBe(false);

    expect(await s.handle.db.select().from(gameResults)).toHaveLength(1);
    const players = await s.handle.db.select().from(gameResultPlayers);
    expect(players).toHaveLength(2);
    expect(players.find((p) => p.userId === a.id)).toMatchObject({ chipDelta: 1_200, rank: 1 });
    const gameLogs = (await s.handle.db.select().from(chipLogs)).filter((l) => l.reason === 'game');
    expect(gameLogs).toHaveLength(2);

    // 판 중에는 지갑이 그대로 (테이블 칩만 갱신)
    expect(await wallet.getBalance(a.id)).toBe(5_000);
    expect(await wallet.cashOut(a.id, 'room-1')).toBe(6_200);
    expect(await wallet.cashOut(a.id, 'room-1')).toBe(0); // 두 번 돌려주지 않는다
    expect(await wallet.getBalance(a.id)).toBe(11_200);
  });

  it('서버 재시작: 남아 있는 테이블 칩(진행 중이던 판의 시작 전 칩)을 환불한다', async () => {
    const a = await newUser();
    await wallet.buyIn(a.id, 'room-1', 4_000, 1_000);
    await wallet.recordHand({
      gameId: 'game-1',
      gameType: 'stud7',
      roomId: 'room-1',
      participants: [{ id: a.id, name: '하늘', isBot: false, chipDelta: 500, finalChips: 4_500 }],
    });
    // 다음 판 도중 서버가 꺼졌다고 가정 → 그 판의 증감은 메모리에만 있었으므로 4,500이 판 시작 전 칩
    expect(await wallet.refundOpenStakes()).toBe(1);
    expect(await wallet.getBalance(a.id)).toBe(6_000 + 4_500);
    expect(await s.handle.db.select().from(tableStakes)).toHaveLength(0);
    const refund = (await s.handle.db.select().from(chipLogs)).filter((l) => l.reason === 'refund');
    expect(refund).toEqual([expect.objectContaining({ delta: 4_500 })]);
    expect(await wallet.refundOpenStakes()).toBe(0);
  });

  it('방에 앉아 있으면 탈퇴할 수 없다', async () => {
    const a = await newUser();
    await s.bundle.rooms.create({ userId: a.id, nickname: '하늘' }, { gameType: 'hula', botCount: 1 });
    const res = await s.app.inject({ method: 'POST', url: '/api/account/delete', payload: { password: 'abcd1234' }, cookies: { sid: a.cookie } });
    expect(res.statusCode).toBe(409);
    expect((await s.handle.db.select().from(users).where(eq(users.id, a.id)))[0]!.deletedAt).toBeNull();
    await s.bundle.rooms.leave(a.id);
  });
});
