import { randomBytes } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { AuthConfig } from '../config/auth.js';
import type { Db } from '../db/client.js';
import { chipLogs, sessions, users, wallets } from '../db/schema.js';
import { clearLoginFailures, isLoginLocked, loginLimitKeys, recordLoginFailure } from './login-limit.js';
import { hashPassword, verifyDummy, verifyPassword } from './password.js';
import { createSession, deleteOtherSessions, type CreatedSession } from './sessions.js';

/** 사용자에게 그대로 보여 줄 한국어 메시지를 가진 오류 */
export class AuthError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export const LOGIN_FAILED_MESSAGE = '아이디 또는 비밀번호가 올바르지 않습니다.';

export interface AuthContext {
  db: Db;
  config: AuthConfig;
  now: () => Date;
}

export interface PublicUser {
  id: string;
  username: string;
  nickname: string;
  balance: number;
}

/** PostgreSQL 고유 제약 위반이면 제약 이름을 돌려준다 (drizzle가 감싼 오류의 cause까지 확인) */
function uniqueViolation(error: unknown): string | null {
  for (let e: unknown = error; e && typeof e === 'object'; e = (e as { cause?: unknown }).cause) {
    const { code, constraint } = e as { code?: string; constraint?: string };
    if (code === '23505') return constraint ?? 'unknown';
  }
  return null;
}

function duplicateError(constraint: string): AuthError {
  return constraint.includes('nickname')
    ? new AuthError(409, '이미 사용 중인 닉네임입니다.', 'nickname')
    : new AuthError(409, '이미 사용 중인 아이디입니다.', 'username');
}

export async function isUsernameTaken(ctx: AuthContext, username: string): Promise<boolean> {
  const rows = await ctx.db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
  return rows.length > 0;
}

export async function isNicknameTaken(ctx: AuthContext, nickname: string, exceptUserId?: string): Promise<boolean> {
  const rows = await ctx.db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.nickname}) = lower(${nickname})`)
    .limit(1);
  return rows.length > 0 && rows[0]!.id !== exceptUserId;
}

export async function getPublicUser(ctx: AuthContext, userId: string): Promise<PublicUser | null> {
  const rows = await ctx.db
    .select({ id: users.id, username: users.username, nickname: users.nickname, balance: wallets.balance })
    .from(users)
    .leftJoin(wallets, eq(wallets.userId, users.id))
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .limit(1);
  const row = rows[0];
  return row ? { ...row, balance: row.balance ?? 0 } : null;
}

/**
 * 회원가입: 사용자, 지갑(기본 칩), 칩 기록(signup)을 한 트랜잭션으로 만든다.
 * 입력은 호출 전에 signupSchema로 검증되어 있어야 한다.
 */
export async function signup(
  ctx: AuthContext,
  input: { username: string; password: string; nickname: string },
): Promise<string> {
  // 해시는 느리므로 트랜잭션 밖에서 미리 만든다
  const passwordHash = await hashPassword(input.password, ctx.config);
  const now = ctx.now();
  try {
    return await ctx.db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ username: input.username, passwordHash, nickname: input.nickname, createdAt: now })
        .returning({ id: users.id });
      const userId = user!.id;
      await tx.insert(wallets).values({ userId, balance: ctx.config.signupChips, updatedAt: now });
      await tx.insert(chipLogs).values({ userId, delta: ctx.config.signupChips, reason: 'signup', createdAt: now });
      return userId;
    });
  } catch (error) {
    const constraint = uniqueViolation(error);
    if (constraint) throw duplicateError(constraint);
    throw error;
  }
}

/**
 * 로그인. 실패 메시지는 항상 같고, 아이디·IP별 실패가 쌓이면 잠근다.
 * 성공하면 같은 계정의 기존 세션을 모두 끊는다(다른 곳의 접속은 로그아웃됨).
 */
export async function login(
  ctx: AuthContext,
  input: { username: string; password: string; remember: boolean; ip: string; userAgent?: string },
): Promise<{ userId: string; session: CreatedSession }> {
  const now = ctx.now();
  const keys = loginLimitKeys(input.username, input.ip);
  if (await isLoginLocked(ctx.db, keys, now)) {
    throw new AuthError(429, `로그인 시도가 너무 많습니다. ${ctx.config.lockMinutes}분 뒤에 다시 시도해 주세요.`);
  }

  const [user] = await ctx.db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(and(eq(users.username, input.username), isNull(users.deletedAt)))
    .limit(1);
  const ok = user ? await verifyPassword(user.passwordHash, input.password) : await verifyDummy(input.password, ctx.config);
  if (!user || !ok) {
    await recordLoginFailure(ctx.db, keys, now, ctx.config);
    throw new AuthError(401, LOGIN_FAILED_MESSAGE);
  }

  await clearLoginFailures(ctx.db, keys[0]!);
  await ctx.db.update(users).set({ lastLoginAt: now }).where(eq(users.id, user.id));
  await deleteOtherSessions(ctx.db, user.id);
  const session = await createSession(ctx.db, user.id, input.remember, input.userAgent, now, ctx.config);
  return { userId: user.id, session };
}

async function requirePassword(ctx: AuthContext, userId: string, password: string): Promise<void> {
  const [user] = await ctx.db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .limit(1);
  if (!user || !(await verifyPassword(user.passwordHash, password))) {
    throw new AuthError(400, '현재 비밀번호가 올바르지 않습니다.', 'currentPassword');
  }
}

export async function changeNickname(ctx: AuthContext, userId: string, nickname: string): Promise<void> {
  if (await isNicknameTaken(ctx, nickname, userId)) throw duplicateError('nickname');
  try {
    await ctx.db.update(users).set({ nickname }).where(eq(users.id, userId));
  } catch (error) {
    const constraint = uniqueViolation(error);
    if (constraint) throw duplicateError(constraint);
    throw error;
  }
}

/** 비밀번호 변경: 현재 비밀번호 확인 후 바꾸고, 지금 쓰는 세션 외의 다른 접속은 모두 끊는다 */
export async function changePassword(
  ctx: AuthContext,
  userId: string,
  sessionId: string,
  input: { currentPassword: string; newPassword: string },
): Promise<void> {
  await requirePassword(ctx, userId, input.currentPassword);
  const passwordHash = await hashPassword(input.newPassword, ctx.config);
  await ctx.db.update(users).set({ passwordHash }).where(eq(users.id, userId));
  await deleteOtherSessions(ctx.db, userId, sessionId);
}

/**
 * 회원 탈퇴: 비밀번호 확인 후 아이디·닉네임을 익명 값으로 바꾸고 비밀번호 해시와 세션, 지갑을 지운다.
 * 전적(game_result_players)은 남기되 익명 닉네임으로 보이게 된다. 같은 아이디로 다시 가입할 수 있다.
 */
export async function deleteAccount(ctx: AuthContext, userId: string, password: string): Promise<void> {
  try {
    await requirePassword(ctx, userId, password);
  } catch {
    throw new AuthError(400, '비밀번호가 올바르지 않습니다.', 'password');
  }
  const tag = randomBytes(4).toString('hex');
  await ctx.db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        username: `deleted_${userId}`,
        nickname: `탈퇴회원_${tag}`,
        passwordHash: '',
        email: null,
        deletedAt: ctx.now(),
      })
      .where(eq(users.id, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await tx.delete(wallets).where(eq(wallets.userId, userId));
  });
}
