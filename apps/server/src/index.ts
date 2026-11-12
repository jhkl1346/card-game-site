import { buildApp } from './app.js';
import { deleteStaleLoginAttempts } from './auth/login-limit.js';
import { deleteExpiredSessions } from './auth/sessions.js';
import { DEFAULT_AUTH_CONFIG } from './config/auth.js';
import { loadEnv } from './config/env.js';
import { openDb } from './db/client.js';
import { WalletService } from './wallet/service.js';

/**
 * 서버 진입점: 환경 변수 → DB 연결·마이그레이션 → HTTP 앱 시작.
 * HTTP API(인증, 지갑)와 Socket.IO(방, 게임)를 같은 포트에서 제공한다.
 */
const env = loadEnv();
const handle = await openDb(env.databaseUrl);
// 지난번 서버가 비정상 종료됐다면 남아 있는 테이블 칩(진행 중이던 판의 시작 전 칩)을 먼저 환불한다
const refunded = await new WalletService(handle.db).refundOpenStakes();
const { app } = await buildApp({
  db: handle.db,
  secureCookies: env.nodeEnv === 'production',
  trustProxy: env.trustProxy,
  logger: true,
});

// 무료 DB 용량을 아끼려고 만료된 세션과 오래된 로그인 실패 기록을 1시간마다 지운다
const cleanup = async () => {
  try {
    const now = new Date();
    const removed = await deleteExpiredSessions(handle.db, now);
    await deleteStaleLoginAttempts(handle.db, now, DEFAULT_AUTH_CONFIG);
    if (removed > 0) app.log.info(`만료된 세션 ${removed}개를 정리했습니다.`);
  } catch (error) {
    app.log.error({ err: error }, '정리 작업 실패');
  }
};
await cleanup();
const timer = setInterval(cleanup, 3_600_000);
timer.unref();

const shutdown = async () => {
  clearInterval(timer);
  await app.close();
  await handle.close();
  process.exit(0);
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

await app.listen({ port: env.port, host: env.nodeEnv === 'production' ? '0.0.0.0' : '127.0.0.1' });
app.log.info(`DB: ${handle.kind === 'pglite' ? '로컬 PGlite' : 'PostgreSQL'}`);
if (refunded > 0) app.log.info(`서버 재시작으로 무효가 된 판의 칩을 ${refunded}명에게 환불했습니다.`);
