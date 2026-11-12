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

export const chipLogReasons = ['signup', 'game', 'relief', 'buyin', 'refund'] as const;
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

/** 로그인 실패 기록. key는 "u:아이디" 또는 "ip:주소" */
export const loginAttempts = pgTable('login_attempts', {
  key: text('key').primaryKey(),
  failCount: integer('fail_count').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
