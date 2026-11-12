import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import * as schema from './schema.js';

/** PGlite와 node-postgres 어느 쪽이든 같은 쿼리 코드를 쓰도록 공통 타입으로 다룬다 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface DbHandle {
  db: Db;
  kind: 'pglite' | 'postgres';
  close(): Promise<void>;
}

const serverRoot = resolve(import.meta.dirname, '../..');
const migrationsFolder = resolve(serverRoot, 'drizzle');

/**
 * DB에 연결하고 마이그레이션을 적용한다.
 * - 로컬 개발·테스트: PGlite (WASM으로 동작하는 PostgreSQL, 설치 불필요)
 * - 배포: 외부 PostgreSQL (DATABASE_URL)
 * 두 경우 모두 같은 PostgreSQL 스키마와 마이그레이션 파일을 쓴다.
 */
export async function openDb(databaseUrl: string): Promise<DbHandle> {
  if (/^postgres(ql)?:\/\//.test(databaseUrl)) {
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 5 });
    const db = drizzlePg(pool, { schema });
    await migratePg(db, { migrationsFolder });
    return { db: db as unknown as Db, kind: 'postgres', close: () => pool.end() };
  }

  let client: PGlite;
  if (databaseUrl === 'memory://') {
    client = new PGlite();
  } else {
    const path = databaseUrl.startsWith('pglite:') ? databaseUrl.slice('pglite:'.length) : 'data/pglite';
    const dataDir = resolve(serverRoot, path);
    mkdirSync(dataDir, { recursive: true });
    client = new PGlite(dataDir);
  }
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder });
  return { db: db as unknown as Db, kind: 'pglite', close: () => client.close() };
}
