import { and, asc, count, desc, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import type { RecordsConfig } from '../config/records.js';
import type { Db } from '../db/client.js';
import { gameResultPlayers, gameResults, gameTypes, tableStakes, userStats, users, wallets, type GameType } from '../db/schema.js';

export interface GameStat {
  gameType: GameType;
  played: number;
  wins: number;
  chipNet: number;
  bestWin: number;
}

export interface RecentGame {
  gameId: string;
  gameType: GameType;
  endedAt: string;
  chipDelta: number;
  /** 칩 증감 순위 (1 = 가장 많이 땀) */
  rank: number;
  /** 봇 포함 참가 인원 */
  players: number;
}

export interface MyStats {
  perGame: GameStat[];
  total: Omit<GameStat, 'gameType'>;
  recent: RecentGame[];
}

export interface RankingEntry {
  rank: number;
  nickname: string;
  /** 지갑 + 테이블에 앉아 있는 칩 */
  chips: number;
  isMe: boolean;
}

export interface Ranking {
  top: RankingEntry[];
  /** 내가 top 밖에 있으면 내 순위 (top 안이면 null) */
  me: RankingEntry | null;
}

/** 지갑 + 테이블 칩. 판 중에도 마지막으로 끝난 판 기준 칩이 반영된다 */
const totalChips = sql<number>`${wallets.balance} + coalesce(${tableStakes.amount}, 0)`.mapWith(Number);

export async function getMyStats(db: Db, userId: string, config: RecordsConfig): Promise<MyStats> {
  const rows = await db.select().from(userStats).where(eq(userStats.userId, userId));
  const perGame = gameTypes.map((gameType): GameStat => {
    const r = rows.find((x) => x.gameType === gameType);
    return { gameType, played: r?.played ?? 0, wins: r?.wins ?? 0, chipNet: r?.chipNet ?? 0, bestWin: r?.bestWin ?? 0 };
  });
  const total = perGame.reduce(
    (acc, g) => ({ played: acc.played + g.played, wins: acc.wins + g.wins, chipNet: acc.chipNet + g.chipNet, bestWin: Math.max(acc.bestWin, g.bestWin) }),
    { played: 0, wins: 0, chipNet: 0, bestWin: 0 },
  );

  const recentRows = await db
    .select({
      gameId: gameResults.gameId,
      gameType: gameResults.gameType,
      endedAt: gameResults.endedAt,
      participants: gameResults.participants,
      chipDelta: gameResultPlayers.chipDelta,
      rank: gameResultPlayers.rank,
    })
    .from(gameResultPlayers)
    .innerJoin(gameResults, eq(gameResults.gameId, gameResultPlayers.gameId))
    .where(eq(gameResultPlayers.userId, userId))
    .orderBy(desc(gameResults.endedAt))
    .limit(config.recentGames);

  return {
    perGame,
    total,
    recent: recentRows.map((r) => ({
      gameId: r.gameId,
      gameType: r.gameType,
      endedAt: r.endedAt.toISOString(),
      chipDelta: r.chipDelta,
      rank: r.rank,
      players: Array.isArray(r.participants) ? r.participants.length : 0,
    })),
  };
}

/** 칩 랭킹: 지갑 + 테이블 칩 합계 순. 같은 칩이면 같은 순위, 먼저 가입한 사람이 위에 보인다 */
export async function getRanking(db: Db, userId: string, size: number): Promise<Ranking> {
  const rows = await db
    .select({ userId: users.id, nickname: users.nickname, chips: totalChips })
    .from(wallets)
    .innerJoin(users, eq(users.id, wallets.userId))
    .leftJoin(tableStakes, eq(tableStakes.userId, wallets.userId))
    .where(isNull(users.deletedAt))
    .orderBy(desc(totalChips), asc(users.createdAt))
    .limit(size);

  const top: RankingEntry[] = [];
  rows.forEach((r, i) => {
    const prev = top[i - 1];
    top.push({ rank: prev && prev.chips === r.chips ? prev.rank : i + 1, nickname: r.nickname, chips: r.chips, isMe: r.userId === userId });
  });
  if (top.some((e) => e.isMe)) return { top, me: null };

  const [mine] = await db
    .select({ nickname: users.nickname, chips: totalChips })
    .from(wallets)
    .innerJoin(users, eq(users.id, wallets.userId))
    .leftJoin(tableStakes, eq(tableStakes.userId, wallets.userId))
    .where(and(eq(wallets.userId, userId), isNull(users.deletedAt)));
  if (!mine) return { top, me: null };
  const [above] = await db
    .select({ n: count() })
    .from(wallets)
    .innerJoin(users, eq(users.id, wallets.userId))
    .leftJoin(tableStakes, eq(tableStakes.userId, wallets.userId))
    .where(and(isNull(users.deletedAt), gt(totalChips, mine.chips)));
  return { top, me: { rank: (above?.n ?? 0) + 1, nickname: mine.nickname, chips: mine.chips, isMe: true } };
}

/** 보관 기간이 지난 판별 기록을 지운다 (game_result_players는 함께 지워진다). 지운 판 수 */
export async function deleteOldGameResults(db: Db, now: Date, config: RecordsConfig): Promise<number> {
  const cutoff = new Date(now.getTime() - config.gameResultRetentionDays * 86_400_000);
  const removed = await db.delete(gameResults).where(lt(gameResults.endedAt, cutoff)).returning({ gameId: gameResults.gameId });
  return removed.length;
}
