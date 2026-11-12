import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import { createDeck } from '@card-game/game-core';
import { authRoutes } from './auth/routes.js';
import { AuthError, type AuthContext } from './auth/service.js';
import { DEFAULT_AUTH_CONFIG, type AuthConfig } from './config/auth.js';
import type { Db } from './db/client.js';

export interface AppOptions {
  db: Db;
  authConfig?: AuthConfig;
  /** 배포(HTTPS)에서는 true */
  secureCookies?: boolean;
  /** 리버스 프록시 뒤에서 실행할 때 X-Forwarded-For를 믿을지 */
  trustProxy?: boolean;
  /** 요청 로그 출력 여부 (테스트에서는 끈다) */
  logger?: boolean;
  /** 시간 주입 (테스트용) */
  now?: () => Date;
}

/** HTTP 앱을 만든다. 실제 포트 열기는 index.ts에서, 테스트는 app.inject()로 호출한다. */
export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    trustProxy: options.trustProxy ?? false,
    bodyLimit: 16 * 1024,
    logger: options.logger
      ? {
          // 쿠키와 인증 헤더는 로그에 남기지 않는다. 요청 본문(비밀번호)은 원래 로그에 찍히지 않는다.
          redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
        }
      : false,
  });
  await app.register(cookie);

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AuthError) {
      return reply.code(error.status).send({ error: error.message, field: error.field });
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      return reply.code(status).send({ error: '요청 형식이 올바르지 않습니다.' });
    }
    request.log.error({ err: error }, '처리하지 못한 오류');
    return reply.code(500).send({ error: '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' });
  });

  app.get('/health', async () => ({ ok: true, deckSize: createDeck().length }));

  const ctx: AuthContext = {
    db: options.db,
    config: options.authConfig ?? DEFAULT_AUTH_CONFIG,
    now: options.now ?? (() => new Date()),
  };
  await app.register(authRoutes, { ctx, secureCookies: options.secureCookies ?? false });

  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: '찾을 수 없는 주소입니다.' }));
  return app;
}
