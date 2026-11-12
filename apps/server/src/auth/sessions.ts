import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull, lt, ne } from 'drizzle-orm';
import type { AuthConfig } from '../config/auth.js';
import type { Db } from '../db/client.js';
import { sessions, users } from '../db/schema.js';

/**
 * 세션 토큰: 32바이트 무작위 값. 쿠키에는 원문을, DB에는 SHA-256 해시만 저장한다.
 * DB가 유출되어도 해시로는 쿠키를 만들 수 없다.
 */
export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function sessionDurationMs(persistent: boolean, config: AuthConfig): number {
  return persistent ? config.persistentSessionDays * 86_400_000 : config.browserSessionHours * 3_600_000;
}

export interface CreatedSession {
  token: string;
  expiresAt: Date;
  persistent: boolean;
}

export async function createSession(
  db: Db,
  userId: string,
  persistent: boolean,
  userAgent: string | undefined,
  now: Date,
  config: AuthConfig,
): Promise<CreatedSession> {
  const token = newSessionToken();
  const expiresAt = new Date(now.getTime() + sessionDurationMs(persistent, config));
  await db.insert(sessions).values({
    userId,
    tokenHash: hashSessionToken(token),
    expiresAt,
    persistent,
    userAgent: userAgent?.slice(0, 200) ?? null,
    createdAt: now,
    lastSeenAt: now,
  });
  return { token, expiresAt, persistent };
}

export interface SessionUser {
  sessionId: string;
  userId: string;
  username: string;
  nickname: string;
  persistent: boolean;
  expiresAt: Date;
  /** 이번 요청에서 만료가 연장되어 쿠키를 다시 보내야 하는지 */
  refreshed: boolean;
}

/**
 * 쿠키 토큰으로 로그인한 사용자를 찾는다. 만료됐거나 탈퇴한 계정이면 null.
 * 마지막 연장 후 sessionTouchIntervalMinutes가 지났으면 만료를 다시 전체 기간으로 늘린다(접속할 때마다 연장).
 */
export async function findSession(db: Db, token: string, now: Date, config: AuthConfig): Promise<SessionUser | null> {
  if (!token || token.length > 100) return null;
  const rows = await db
    .select({
      sessionId: sessions.id,
      userId: users.id,
      username: users.username,
      nickname: users.nickname,
      persistent: sessions.persistent,
      expiresAt: sessions.expiresAt,
      lastSeenAt: sessions.lastSeenAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashSessionToken(token)), gt(sessions.expiresAt, now), isNull(users.deletedAt)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  const { lastSeenAt, ...rest } = row;
  if (now.getTime() - lastSeenAt.getTime() < config.sessionTouchIntervalMinutes * 60_000) {
    return { ...rest, refreshed: false };
  }
  const expiresAt = new Date(now.getTime() + sessionDurationMs(row.persistent, config));
  await db.update(sessions).set({ expiresAt, lastSeenAt: now }).where(eq(sessions.id, row.sessionId));
  return { ...rest, expiresAt, refreshed: true };
}

export async function deleteSessionByToken(db: Db, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(token)));
}

/** 이 사용자의 다른 세션을 모두 끊는다 (중복 접속 처리, 비밀번호 변경) */
export async function deleteOtherSessions(db: Db, userId: string, keepSessionId?: string): Promise<void> {
  await db
    .delete(sessions)
    .where(keepSessionId ? and(eq(sessions.userId, userId), ne(sessions.id, keepSessionId)) : eq(sessions.userId, userId));
}

/** 만료된 세션 정리 (서버가 주기적으로 호출). 지운 개수를 돌려준다 */
export async function deleteExpiredSessions(db: Db, now: Date): Promise<number> {
  const deleted = await db.delete(sessions).where(lt(sessions.expiresAt, now)).returning({ id: sessions.id });
  return deleted.length;
}
