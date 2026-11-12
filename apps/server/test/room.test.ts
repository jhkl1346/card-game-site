import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SERVER_LIMITS } from '../src/config/limits.js';
import { RoomManager } from '../src/rooms/manager.js';
import { RoomError, type GameRoom } from '../src/rooms/room.js';
import { WalletError, type HandRecord, type WalletPort } from '../src/wallet/service.js';

/** 메모리 지갑: DB 없이 GameRoom 흐름만 검증한다 */
class MemoryWallet implements WalletPort {
  balances = new Map<string, number>();
  stakes = new Map<string, { roomId: string; amount: number }>();
  hands: HandRecord[] = [];
  private readonly gameIds = new Set<string>();

  async buyIn(userId: string, roomId: string, buyIn: number, minAmount: number): Promise<number> {
    if (this.stakes.has(userId)) throw new WalletError('이미 다른 방에 앉아 있습니다.');
    const balance = this.balances.get(userId) ?? 0;
    const amount = Math.min(buyIn, balance);
    if (amount < minAmount) throw new WalletError('칩이 부족합니다.');
    this.balances.set(userId, balance - amount);
    this.stakes.set(userId, { roomId, amount });
    return amount;
  }
  async recordHand(record: HandRecord): Promise<boolean> {
    if (this.gameIds.has(record.gameId)) return false;
    this.gameIds.add(record.gameId);
    this.hands.push(record);
    for (const p of record.participants) {
      const stake = this.stakes.get(p.id);
      if (stake && stake.roomId === record.roomId) stake.amount = p.finalChips;
    }
    return true;
  }
  async cashOut(userId: string, roomId: string): Promise<number> {
    const stake = this.stakes.get(userId);
    if (!stake || stake.roomId !== roomId) return 0;
    this.stakes.delete(userId);
    this.balances.set(userId, (this.balances.get(userId) ?? 0) + stake.amount);
    return stake.amount;
  }
  total(userId: string): number {
    return (this.balances.get(userId) ?? 0) + (this.stakes.get(userId)?.amount ?? 0);
  }
}

function seeded(seed: number) {
  let a = seed >>> 0;
  const random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { random, randomInt: (max: number) => Math.floor(random() * max) };
}

const alice = { userId: '00000000-0000-4000-8000-00000000000a', nickname: '앨리스' };
const bob = { userId: '00000000-0000-4000-8000-00000000000b', nickname: '밥' };

let wallet: MemoryWallet;
let manager: RoomManager;
let notices: Array<{ userId: string; message: string }>;
let leftUsers: string[];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  wallet = new MemoryWallet();
  wallet.balances.set(alice.userId, 20_000);
  wallet.balances.set(bob.userId, 20_000);
  notices = [];
  leftUsers = [];
  const rng = seeded(7);
  manager = new RoomManager({
    wallet,
    limits: DEFAULT_SERVER_LIMITS,
    randomInt: rng.randomInt,
    botRandom: rng.random,
    events: {
      roomChanged: () => undefined,
      roomClosed: () => undefined,
      lobbyChanged: () => undefined,
      notice: (userId, message) => notices.push({ userId, message }),
      memberLeft: (_room, userId) => leftUsers.push(userId),
    },
    logError: (message, error) => {
      throw new Error(`${message}: ${String(error)}`);
    },
  });
});

afterEach(async () => {
  await manager.shutdown();
  vi.useRealTimers();
});

const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);
const handNo = (room: GameRoom) => room.handNo;

describe('혼자 하기와 판 진행', () => {
  it.each(['stud7', 'holdem', 'hula'] as const)('%s: 봇과 판이 이어지고, 사람이 가만히 있으면 시간 초과 자동 액션', async (gameType) => {
    const room = await manager.createSingle(alice, gameType);
    expect(room.settings.isPrivate).toBe(true);
    expect(room.seats.filter((s) => s?.isBot)).toHaveLength(room.settings.maxPlayers - 1);
    expect(room.status).toBe('playing');
    expect(handNo(room)).toBe(1);

    // 10분 동안 사람은 아무것도 하지 않는다 → 매 차례 시간 초과(체크/다이, 훌라는 자동 버리기)
    for (let i = 0; i < 60 && handNo(room) < 3; i++) await tick(10_000);
    expect(handNo(room)).toBeGreaterThanOrEqual(3);
    // 판마다 정확히 한 번씩 기록되고, gameId는 모두 다르다
    const ids = wallet.hands.map((h) => h.gameId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    // 기록된 마지막 테이블 칩이 지갑 쪽 table_stakes에 반영된다
    const last = wallet.hands.at(-1)!.participants.find((p) => p.id === alice.userId);
    if (last && last.finalChips > 0) expect(wallet.stakes.get(alice.userId)!.amount).toBe(last.finalChips);
  });

  it('스냅샷: 내 카드만 보이고 남의 비공개 카드·덱·번 카드는 들어 있지 않다', async () => {
    const room = await manager.createSingle(alice, 'holdem', { maxPlayers: 4 });
    const snap = room.snapshotFor(alice.userId);
    const game = snap.game as { players: Array<{ id: string; hole: unknown[] }> };
    for (const p of game.players) {
      if (p.id === alice.userId) expect(p.hole.every((c) => c !== null)).toBe(true);
      else expect(p.hole).toEqual([null, null]);
    }
    const json = JSON.stringify(snap);
    expect(json).not.toContain('"deck"');
    expect(json).not.toContain('burnedCards');
    // 방 밖의 사람에게는 게임 시야를 주더라도 아무 비공개 카드도 없다
    const outsider = room.snapshotFor(null).game as { players: Array<{ hole: unknown[] }> };
    expect(outsider.players.every((p) => p.hole.every((c) => c === null))).toBe(true);
  });

  it('차례가 아닌 사람의 액션과 형식이 틀린 액션은 거절된다', async () => {
    const room = await manager.create(alice, { gameType: 'holdem', maxPlayers: 3, botCount: 1 });
    await manager.join(bob, { roomId: room.id });
    await manager.start(alice.userId);
    const actor = room.snapshotFor(alice.userId).turn!.actorId;
    const other = actor === alice.userId ? bob.userId : alice.userId;
    if (actor.startsWith('bot:')) await tick(3_000);
    const now = room.snapshotFor(alice.userId).turn!.actorId;
    const waiting = now === alice.userId ? bob.userId : alice.userId;
    await expect(manager.act(waiting, { type: 'fold' })).rejects.toThrow('내 차례가 아닙니다');
    if (!now.startsWith('bot:')) {
      await expect(manager.act(now, { type: 'jump' })).rejects.toThrow('액션 형식');
      await expect(manager.act(now, { type: 'raise', amount: 1 })).rejects.toBeInstanceOf(RoomError);
      await manager.act(now, { type: 'fold' });
    }
    expect(other).toBeTruthy();
  });

  it('방장만 시작·강퇴할 수 있고, 강퇴되면 칩이 지갑으로 돌아온다', async () => {
    const room = await manager.create(alice, { gameType: 'hula', maxPlayers: 4, botCount: 1 });
    await manager.join(bob, { roomId: room.id });
    await expect(manager.start(bob.userId)).rejects.toThrow('방장만');
    await expect(manager.kick(bob.userId, alice.userId)).rejects.toThrow('방장만');
    await manager.kick(alice.userId, bob.userId);
    expect(room.hasMember(bob.userId)).toBe(false);
    expect(wallet.balances.get(bob.userId)).toBe(20_000);
    expect(notices).toContainEqual({ userId: bob.userId, message: '방장이 나를 강퇴했습니다.' });
  });

  it('방장이 나가면 남은 사람에게 방장이 넘어가고, 모두 나가면 방이 닫힌다', async () => {
    const room = await manager.create(alice, { gameType: 'stud7', maxPlayers: 3, botCount: 0 });
    await manager.join(bob, { roomId: room.id });
    await manager.leave(alice.userId);
    expect(room.hostId).toBe(bob.userId);
    await manager.leave(bob.userId);
    expect(manager.getRoom(room.id)).toBeUndefined();
    expect(wallet.total(alice.userId)).toBe(20_000);
    expect(wallet.total(bob.userId)).toBe(20_000);
  });
});

describe('나가기·접속 끊김·재접속', () => {
  it('판 도중 나가면 이번 판은 자동으로 마치고 판이 끝날 때 칩이 지갑으로 돌아온다', async () => {
    const room = await manager.createSingle(alice, 'holdem', { maxPlayers: 3 });
    const returned = await manager.leave(alice.userId);
    expect(returned).toBeNull(); // 판이 끝날 때까지 보류
    expect(room.seatOf(alice.userId)!.leaving).toBe(true);
    await tick(60_000);
    expect(wallet.stakes.has(alice.userId)).toBe(false);
    const recorded = wallet.hands[0]!.participants.find((p) => p.id === alice.userId)!;
    expect(wallet.balances.get(alice.userId)).toBe(20_000 - 5_000 + recorded.finalChips);
    // 사람이 없으니 방이 닫힌다
    expect(manager.getRoom(room.id)).toBeUndefined();
    // 판이 끝나 일어난 사람에게 로비 화면용 스냅샷을 보내도록 알린다
    expect(leftUsers).toEqual([alice.userId]);
  });

  it('접속이 끊기면 30초 동안 자리를 지키고, 그 뒤에는 봇이 대신하며, 다시 접속하면 돌아온다', async () => {
    const room = await manager.createSingle(alice, 'hula');
    await manager.setConnected(alice.userId, false);
    expect(room.seatOf(alice.userId)!.connected).toBe(false);
    await tick(DEFAULT_SERVER_LIMITS.reconnectGraceMs - 1_000);
    expect(room.seatOf(alice.userId)!.botControlled).toBe(false);
    await tick(2_000);
    const seat = room.seatOf(alice.userId);
    // 판에 참여 중이면 봇이 대신하고, 판 사이였다면 일어나 칩을 돌려받는다
    if (seat) {
      expect(seat.botControlled).toBe(true);
      await manager.setConnected(alice.userId, true);
      expect(room.seatOf(alice.userId)!.botControlled).toBe(false);
      expect(room.seatOf(alice.userId)!.connected).toBe(true);
    } else {
      expect(wallet.stakes.has(alice.userId)).toBe(false);
    }
  });

  it('한 사람은 한 방에만 있을 수 있다', async () => {
    await manager.createSingle(alice, 'stud7');
    await expect(manager.createSingle(alice, 'hula')).rejects.toThrow('이미 다른 방에');
  });

  it('칩이 부족하면 앉을 수 없다', async () => {
    wallet.balances.set(bob.userId, 100);
    await expect(manager.createSingle(bob, 'holdem')).rejects.toThrow('칩이 부족합니다');
    expect(manager.size).toBe(0);
  });
});

describe('ServerLimits', () => {
  it('최대 방 수에 도달하면 새 방을 만들 수 없다', async () => {
    const small = new RoomManager({
      wallet,
      limits: { ...DEFAULT_SERVER_LIMITS, maxRooms: 1 },
      randomInt: (m) => Math.floor(Math.random() * m),
      botRandom: Math.random,
      events: { roomChanged: () => undefined, roomClosed: () => undefined, lobbyChanged: () => undefined, notice: () => undefined },
      logError: () => undefined,
    });
    await small.create(alice, { gameType: 'hula', botCount: 1 });
    await expect(small.create(bob, { gameType: 'hula', botCount: 1 })).rejects.toThrow('방이 너무 많아');
    await small.shutdown();
  });

  it('빠른 입장: 빈자리가 있는 공개 방에 들어가고, 없으면 새로 만든다', async () => {
    const room = await manager.create(alice, { gameType: 'stud7', maxPlayers: 3, botCount: 0 });
    const joined = await manager.quickJoin(bob, 'stud7');
    expect(joined.id).toBe(room.id);
    await manager.leave(bob.userId);
    const holdem = await manager.quickJoin(bob, 'holdem');
    expect(holdem.id).not.toBe(room.id);
    expect(holdem.status).toBe('playing');
  });

  it('비공개 방은 목록에 없고 코드로만 들어간다', async () => {
    const room = await manager.create(alice, { gameType: 'hula', isPrivate: true, botCount: 0 });
    expect(manager.listPublic()).toHaveLength(0);
    await expect(manager.join(bob, { roomId: room.id })).rejects.toThrow('입장 코드로만');
    await manager.join(bob, { code: room.code.toLowerCase() });
    expect(room.seatOf(bob.userId)).not.toBeNull();
    expect(room.snapshotFor(bob.userId).room.code).toBe(room.code);
    expect(room.snapshotFor(null).room.code).toBeNull();
  });

  it('잘못된 방 설정은 거절된다', async () => {
    await expect(manager.create(alice, { gameType: 'poker' })).rejects.toThrow();
    await expect(manager.create(alice, { gameType: 'hula', maxPlayers: 5 })).rejects.toThrow('2~4명');
    await expect(manager.create(alice, { gameType: 'holdem', stake: 100, buyIn: 1_000 })).rejects.toThrow('20배');
    await expect(manager.create(alice, { gameType: 'stud7', maxPlayers: 3, botCount: 3 })).rejects.toThrow('봇 수');
    expect(wallet.balances.get(alice.userId)).toBe(20_000);
  });
});
