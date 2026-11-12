import { and, eq, gt, sql } from 'drizzle-orm';
import type { ReliefChipConfig } from '../config/auth.js';
import type { Db } from '../db/client.js';
import { chipLogs, gameResultPlayers, gameResults, tableStakes, wallets, type GameType } from '../db/schema.js';

/** 사용자에게 그대로 보여 줄 한국어 메시지를 가진 지갑 오류 */
export class WalletError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WalletError';
  }
}

export interface HandParticipant {
  /** 사람은 userId, 봇은 봇 id */
  id: string;
  name: string;
  isBot: boolean;
  /** 이번 판 칩 증감 */
  chipDelta: number;
  /** 판이 끝난 뒤 테이블 칩 */
  finalChips: number;
}

export interface HandRecord {
  /** 판마다 새로 만드는 고유 id. 같은 id로 두 번 정산되지 않는다 */
  gameId: string;
  gameType: GameType;
  roomId: string;
  participants: HandParticipant[];
}

/**
 * 방(GameRoom)이 쓰는 지갑 기능. 테스트에서는 메모리 구현으로 바꿔 끼울 수 있다.
 */
export interface WalletPort {
  /** 지갑 → 테이블. 실제로 앉은 칩 수를 돌려준다 (잔액이 buyIn보다 적으면 가진 만큼, 최소 minAmount) */
  buyIn(userId: string, roomId: string, buyIn: number, minAmount: number): Promise<number>;
  /** 한 판의 결과를 한 트랜잭션으로 기록한다. 이미 기록된 gameId면 false */
  recordHand(record: HandRecord): Promise<boolean>;
  /** 테이블 → 지갑. 돌려준 칩 수 (이미 일어났으면 0) */
  cashOut(userId: string, roomId: string): Promise<number>;
}

export class WalletService implements WalletPort {
  constructor(private readonly db: Db) {}

  async getBalance(userId: string): Promise<number> {
    const [row] = await this.db.select({ balance: wallets.balance }).from(wallets).where(eq(wallets.userId, userId));
    return row?.balance ?? 0;
  }

  async buyIn(userId: string, roomId: string, buyIn: number, minAmount: number): Promise<number> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx.select().from(tableStakes).where(eq(tableStakes.userId, userId));
      if (existing) throw new WalletError('이미 다른 방에 앉아 있습니다. 먼저 그 방에서 나와 주세요.');
      const [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, userId)).for('update');
      const balance = wallet?.balance ?? 0;
      const amount = Math.min(buyIn, balance);
      if (amount < minAmount || amount <= 0) {
        throw new WalletError(`칩이 부족합니다. 이 방에 앉으려면 최소 ${minAmount.toLocaleString('ko-KR')}개가 필요합니다.`);
      }
      const updated = await tx
        .update(wallets)
        .set({ balance: sql`${wallets.balance} - ${amount}`, updatedAt: new Date() })
        .where(and(eq(wallets.userId, userId), sql`${wallets.balance} >= ${amount}`))
        .returning({ balance: wallets.balance });
      if (updated.length === 0) throw new WalletError('칩이 부족합니다.');
      await tx.insert(tableStakes).values({ userId, roomId, amount });
      await tx.insert(chipLogs).values({ userId, delta: -amount, reason: 'buyin', gameId: roomId });
      return amount;
    });
  }

  async recordHand(record: HandRecord): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      // gameId가 이미 있으면 아무것도 하지 않는다 (중복 정산 방지)
      const inserted = await tx
        .insert(gameResults)
        .values({
          gameId: record.gameId,
          gameType: record.gameType,
          participants: record.participants.map(({ id, name, isBot, chipDelta }) => ({ id, name, isBot, chipDelta })),
        })
        .onConflictDoNothing()
        .returning({ gameId: gameResults.gameId });
      if (inserted.length === 0) return false;

      const ranked = [...record.participants].sort((a, b) => b.chipDelta - a.chipDelta);
      const rankOf = (p: HandParticipant) => ranked.findIndex((x) => x.chipDelta === p.chipDelta) + 1;
      for (const p of record.participants) {
        if (p.isBot) continue;
        await tx.insert(gameResultPlayers).values({ gameId: record.gameId, userId: p.id, chipDelta: p.chipDelta, rank: rankOf(p) });
        if (p.chipDelta !== 0) {
          await tx.insert(chipLogs).values({ userId: p.id, delta: p.chipDelta, reason: 'game', gameId: record.gameId });
        }
        await tx
          .update(tableStakes)
          .set({ amount: p.finalChips, updatedAt: new Date() })
          .where(and(eq(tableStakes.userId, p.id), eq(tableStakes.roomId, record.roomId)));
      }
      return true;
    });
  }

  async cashOut(userId: string, roomId: string): Promise<number> {
    return this.db.transaction(async (tx) => {
      const [stake] = await tx
        .delete(tableStakes)
        .where(and(eq(tableStakes.userId, userId), eq(tableStakes.roomId, roomId)))
        .returning({ amount: tableStakes.amount });
      if (!stake) return 0;
      if (stake.amount > 0) {
        await tx
          .update(wallets)
          .set({ balance: sql`${wallets.balance} + ${stake.amount}`, updatedAt: new Date() })
          .where(eq(wallets.userId, userId));
        await tx.insert(chipLogs).values({ userId, delta: stake.amount, reason: 'cashout', gameId: roomId });
      }
      return stake.amount;
    });
  }

  /**
   * 서버 시작 시 호출: 메모리에 있던 방은 모두 사라졌으므로, 남아 있는 테이블 칩(= 진행 중이던 판이 시작되기 전 칩)을
   * 지갑으로 환불한다. 환불한 사람 수를 돌려준다.
   */
  async refundOpenStakes(): Promise<number> {
    const stakes = await this.db.select().from(tableStakes);
    let count = 0;
    for (const s of stakes) {
      const refunded = await this.db.transaction(async (tx) => {
        const [stake] = await tx.delete(tableStakes).where(eq(tableStakes.userId, s.userId)).returning();
        if (!stake) return false;
        if (stake.amount > 0) {
          await tx
            .update(wallets)
            .set({ balance: sql`${wallets.balance} + ${stake.amount}`, updatedAt: new Date() })
            .where(eq(wallets.userId, stake.userId));
          await tx.insert(chipLogs).values({ userId: stake.userId, delta: stake.amount, reason: 'refund', gameId: stake.roomId });
        }
        return true;
      });
      if (refunded) count++;
    }
    return count;
  }

  /**
   * 구제 칩: 지갑 잔액이 정확히 0이고 테이블에 남은 칩도 없을 때만 지급한다. 횟수 제한은 없다.
   * - liveTableChips: 방 관리자가 알고 있는 지금 이 순간의 테이블 칩 (판 진행 중 변화 반영)
   * - DB의 table_stakes도 함께 확인한다.
   * - 조건부 UPDATE(WHERE balance = 0)로 동시에 여러 번 요청해도 한 번만 지급된다.
   */
  async claimRelief(userId: string, liveTableChips: number, config: ReliefChipConfig): Promise<number> {
    if (liveTableChips > 0) throw new WalletError('테이블에 칩이 남아 있어 구제 칩을 받을 수 없습니다.');
    return this.db.transaction(async (tx) => {
      const [stake] = await tx
        .select({ amount: tableStakes.amount })
        .from(tableStakes)
        .where(and(eq(tableStakes.userId, userId), gt(tableStakes.amount, 0)));
      if (stake) throw new WalletError('테이블에 칩이 남아 있어 구제 칩을 받을 수 없습니다.');
      const updated = await tx
        .update(wallets)
        .set({ balance: config.amount, updatedAt: new Date() })
        .where(and(eq(wallets.userId, userId), eq(wallets.balance, config.requiredBalance)))
        .returning({ balance: wallets.balance });
      if (updated.length === 0) throw new WalletError('구제 칩은 보유 칩이 0개일 때만 받을 수 있습니다.');
      await tx.insert(chipLogs).values({ userId, delta: config.amount, reason: 'relief' });
      return config.amount;
    });
  }
}
