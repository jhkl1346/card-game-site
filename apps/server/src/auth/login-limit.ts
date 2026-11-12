import { and, eq, gt, inArray, isNull, lt, or } from 'drizzle-orm';
import type { AuthConfig } from '../config/auth.js';
import type { Db } from '../db/client.js';
import { loginAttempts } from '../db/schema.js';

/**
 * 로그인 실패 제한 (무차별 대입 방지).
 * - 아이디("u:아이디")와 IP("ip:주소")를 따로 센다. 둘 중 하나라도 잠기면 로그인할 수 없다.
 * - lockMinutes 안에 maxLoginFailures번 실패하면 lockMinutes 동안 잠근다.
 * - 마지막 실패 후 lockMinutes가 지나면 실패 횟수는 처음부터 다시 센다.
 * - 없는 아이디도 똑같이 세고 잠가서 아이디 존재 여부가 드러나지 않게 한다.
 * DB에 저장하므로 서버가 재시작돼도 잠금이 유지된다.
 */
export function loginLimitKeys(username: string, ip: string): string[] {
  return [`u:${username.toLowerCase().slice(0, 100)}`, `ip:${ip}`];
}

export async function isLoginLocked(db: Db, keys: string[], now: Date): Promise<boolean> {
  const rows = await db
    .select({ key: loginAttempts.key })
    .from(loginAttempts)
    .where(and(inArray(loginAttempts.key, keys), gt(loginAttempts.lockedUntil, now)))
    .limit(1);
  return rows.length > 0;
}

export async function recordLoginFailure(db: Db, keys: string[], now: Date, config: AuthConfig): Promise<void> {
  const windowMs = config.lockMinutes * 60_000;
  await db.transaction(async (tx) => {
    for (const key of keys) {
      const [row] = await tx.select().from(loginAttempts).where(eq(loginAttempts.key, key)).for('update');
      const stale = !row || now.getTime() - row.updatedAt.getTime() > windowMs;
      const count = (stale ? 0 : row.failCount) + 1;
      const locked = count >= config.maxLoginFailures;
      const values = {
        failCount: locked ? 0 : count,
        lockedUntil: locked ? new Date(now.getTime() + windowMs) : (row?.lockedUntil ?? null),
        updatedAt: now,
      };
      await tx
        .insert(loginAttempts)
        .values({ key, ...values })
        .onConflictDoUpdate({ target: loginAttempts.key, set: values });
    }
  });
}

/** 로그인 성공 시 그 아이디의 실패 기록만 지운다 (IP 기록은 남겨서 여러 아이디를 번갈아 찔러 보는 것을 막는다) */
export async function clearLoginFailures(db: Db, usernameKey: string): Promise<void> {
  await db.delete(loginAttempts).where(eq(loginAttempts.key, usernameKey));
}

/** 오래된 기록 정리 (서버가 주기적으로 호출) */
export async function deleteStaleLoginAttempts(db: Db, now: Date, config: AuthConfig): Promise<void> {
  const cutoff = new Date(now.getTime() - config.lockMinutes * 60_000);
  await db
    .delete(loginAttempts)
    .where(and(lt(loginAttempts.updatedAt, cutoff), or(isNull(loginAttempts.lockedUntil), lt(loginAttempts.lockedUntil, now))));
}
