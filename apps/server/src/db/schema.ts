import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * DB 스키마 (영구 데이터만). 진행 중인 방·게임 상태, 덱, 번 카드, 셔플 시드는 저장하지 않는다.
 * 칩은 bigint(number 모드)로 저장한다. 실제 돈이 아닌 가상 칩이라 2^53 안에서 충분하다.
 */

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    username: text('username').notNull(),
    passwordHash: text('password_hash').notNull(),
    nickname: text('nickname').notNull(),
    /** 추후 이메일 인증 기반 비밀번호 재설정용 (지금은 수집하지 않음) */
    email: text('email'),
    createdAt: createdAt(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    /** 탈퇴 시각. 탈퇴하면 아이디·닉네임을 익명 값으로 바꾸고 비밀번호 해시를 지운다 */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('users_username_key').on(t.username),
    // 닉네임은 대소문자만 다른 중복도 막는다
    uniqueIndex('users_nickname_key').on(sql`lower(${t.nickname})`),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 쿠키 토큰의 SHA-256 해시 (토큰 원문은 저장하지 않음) */
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** 로그인 상태 유지 여부 */
    persistent: boolean('persistent').notNull(),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('sessions_token_hash_key').on(t.tokenHash), index('sessions_user_id_idx').on(t.userId)],
);

export const wallets = pgTable(
  'wallets',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    balance: bigint('balance', { mode: 'number' }).notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('wallets_balance_nonnegative', sql`${t.balance} >= 0`)],
);

/**
 * signup: 가입 지급, buyin: 방에 앉을 때 지갑→테이블, game: 한 판의 칩 증감(기록용, 지갑은 그대로),
 * cashout: 일어날 때 테이블→지갑, refund: 서버 재시작으로 무효가 된 판의 환불, relief: 구제 칩
 */
export const chipLogReasons = ['signup', 'game', 'relief', 'buyin', 'cashout', 'refund'] as const;
export type ChipLogReason = (typeof chipLogReasons)[number];

export const chipLogs = pgTable(
  'chip_logs',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    delta: bigint('delta', { mode: 'number' }).notNull(),
    reason: text('reason', { enum: chipLogReasons }).notNull(),
    gameId: text('game_id'),
    createdAt: createdAt(),
  },
  (t) => [index('chip_logs_user_id_idx').on(t.userId)],
);

export const gameTypes = ['stud7', 'holdem', 'hula'] as const;
export type GameType = (typeof gameTypes)[number];

export const gameResults = pgTable(
  'game_results',
  {
    /** 중복 정산 방지 키 (같은 판은 한 번만 들어간다) */
    gameId: text('game_id').primaryKey(),
    gameType: text('game_type', { enum: gameTypes }).notNull(),
    /** 참가자 요약 (봇 포함): [{ id, name, isBot, chipDelta }] */
    participants: jsonb('participants').notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('game_results_ended_at_idx').on(t.endedAt)],
);

/** 전적·랭킹 조회용 (사람 참가자만) */
export const gameResultPlayers = pgTable(
  'game_result_players',
  {
    gameId: text('game_id')
      .notNull()
      .references(() => gameResults.gameId, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    chipDelta: bigint('chip_delta', { mode: 'number' }).notNull(),
    /** 순위 (1 = 승리) */
    rank: integer('rank').notNull(),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.userId] }), index('game_result_players_user_id_idx').on(t.userId)],
);

/**
 * 게임별 누적 전적 (사람만). 판이 끝날 때 recordHand와 같은 트랜잭션에서 더한다.
 * 오래된 game_results를 보관 기간이 지나 지워도 누적 전적은 그대로 남는다.
 */
export const userStats = pgTable(
  'user_stats',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    gameType: text('game_type', { enum: gameTypes }).notNull(),
    /** 참여한 판 수 */
    played: integer('played').notNull().default(0),
    /** 칩을 딴 판 수 (chip_delta > 0) */
    wins: integer('wins').notNull().default(0),
    /** 칩 증감 합계 */
    chipNet: bigint('chip_net', { mode: 'number' }).notNull().default(0),
    /** 한 판에 가장 많이 딴 칩 */
    bestWin: bigint('best_win', { mode: 'number' }).notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.gameType] })],
);

/**
 * 테이블에 앉아 있는 칩 (바이인 후 아직 지갑으로 돌아오지 않은 칩).
 * - 바이인할 때 만들고, 판이 끝날 때마다 그 판의 정산과 같은 트랜잭션에서 amount를 최신 테이블 칩으로 바꾼다.
 * - 일어날 때 지우면서 amount를 지갑에 돌려준다.
 * - 서버가 재시작되면 남아 있는 행이 곧 "진행 중이던 판이 시작되기 전의 테이블 칩"이므로 그대로 환불한다.
 * 한 사람은 한 번에 한 방에만 앉을 수 있다(user_id 고유).
 */
export const tableStakes = pgTable('table_stakes', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  roomId: text('room_id').notNull(),
  amount: bigint('amount', { mode: 'number' }).notNull(),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [check('table_stakes_amount_nonnegative', sql`${t.amount} >= 0`)]);

/** 로그인 실패 기록. key는 "u:아이디" 또는 "ip:주소" */
export const loginAttempts = pgTable('login_attempts', {
  key: text('key').primaryKey(),
  failCount: integer('fail_count').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
