import { sql } from 'drizzle-orm';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp, type AppBundle, type AppOptions } from '../src/app.js';
import { DEFAULT_AUTH_CONFIG, type AuthConfig } from '../src/config/auth.js';
import { openDb, type DbHandle } from '../src/db/client.js';

/** 테스트에서는 argon2 비용만 낮춰 빠르게 돌린다 (알고리즘은 같은 argon2id) */
export const TEST_AUTH_CONFIG: AuthConfig = {
  ...DEFAULT_AUTH_CONFIG,
  argon2: { memoryCost: 1024, timeCost: 1, parallelism: 1 },
};

export interface TestServer {
  app: FastifyInstance;
  bundle: AppBundle;
  handle: DbHandle;
  clock: { now: Date; advance(ms: number): void };
  /** 모든 테이블을 비우고 시계를 처음으로 되돌린다 (DB를 매번 새로 만드는 것보다 훨씬 빠르다) */
  reset(): Promise<void>;
  close(): Promise<void>;
}

/** 메모리 PGlite + 마이그레이션 + 앱. 시계는 직접 움직일 수 있다 */
export async function createTestServer(extra: Partial<AppOptions> = {}): Promise<TestServer> {
  const handle = await openDb('memory://');
  const start = new Date('2026-11-12T00:00:00Z');
  const clock = {
    now: start,
    advance(ms: number) {
      this.now = new Date(this.now.getTime() + ms);
    },
  };
  const bundle = await buildApp({ db: handle.db, authConfig: TEST_AUTH_CONFIG, now: () => clock.now, ...extra });
  const { app } = bundle;
  return {
    app,
    bundle,
    handle,
    clock,
    async reset() {
      clock.now = start;
      await handle.db.execute(
        sql`TRUNCATE users, sessions, wallets, chip_logs, game_results, game_result_players, login_attempts, table_stakes CASCADE`,
      );
    },
    async close() {
      await app.close();
      await handle.close();
    },
  };
}

export function sessionCookie(res: LightMyRequestResponse): { value: string; expires?: Date } | undefined {
  const c = (res.cookies as Array<{ name: string; value: string; expires?: Date }>).find((x) => x.name === 'sid');
  return c ? { value: c.value, ...(c.expires ? { expires: c.expires } : {}) } : undefined;
}

export const validSignup = (overrides: Record<string, unknown> = {}) => ({
  username: 'player01',
  password: 'abcd1234',
  passwordConfirm: 'abcd1234',
  nickname: '하늘',
  ...overrides,
});

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
