import { randomInt } from 'node:crypto';
import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import { createDeck, type BotRandom, type RandomInt } from '@card-game/game-core';
import { authRoutes, makeRequireAuth } from './auth/routes.js';
import { AuthError, type AuthContext } from './auth/service.js';
import { DEFAULT_AUTH_CONFIG, RELIEF_CHIP_CONFIG, type AuthConfig, type ReliefChipConfig } from './config/auth.js';
import { DEFAULT_SERVER_LIMITS, type ServerLimits } from './config/limits.js';
import { DEFAULT_RECORDS_CONFIG, type RecordsConfig } from './config/records.js';
import type { Db } from './db/client.js';
import { RoomManager } from './rooms/manager.js';
import { createSocketLayer, type SocketLayer } from './socket/index.js';
import { statsRoutes } from './stats/routes.js';
import { isWebRoute, securityHeaders, serveWeb } from './http/web.js';
import { walletRoutes } from './wallet/routes.js';
import { WalletService } from './wallet/service.js';

export interface AppOptions {
  db: Db;
  authConfig?: AuthConfig;
  limits?: ServerLimits;
  relief?: ReliefChipConfig;
  records?: RecordsConfig;
  /** 배포(HTTPS)에서는 true */
  secureCookies?: boolean;
  /** 리버스 프록시 뒤에서 실행할 때 X-Forwarded-For를 믿을지 */
  trustProxy?: boolean;
  /** 빌드된 화면 파일 폴더 (주면 같은 주소에서 화면도 제공한다) */
  webRoot?: string;
  /** 소켓 연결 시 Origin이 같은 호스트인지 확인 (배포에서 켠다) */
  checkSocketOrigin?: boolean;
  /** 요청 로그 출력 여부 (테스트에서는 끈다) */
  logger?: boolean;
  /** 시간 주입 (테스트용) */
  now?: () => Date;
  /** 난수 주입 (테스트용). 기본은 셔플에 crypto.randomInt */
  randomInt?: RandomInt;
  botRandom?: BotRandom;
}

export interface AppBundle {
  app: FastifyInstance;
  rooms: RoomManager;
  wallet: WalletService;
  sockets: SocketLayer;
}

/** HTTP 앱 + Socket.IO + 방 관리자를 만든다. 실제 포트 열기는 index.ts에서, 테스트는 app.inject() 또는 임시 포트로 */
export async function buildApp(options: AppOptions): Promise<AppBundle> {
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
  securityHeaders(app, options.secureCookies ?? false);
  const logError = (message: string, error: unknown) => app.log.error({ err: error }, message);

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
  const secureCookies = options.secureCookies ?? false;
  const limits = options.limits ?? DEFAULT_SERVER_LIMITS;
  const wallet = new WalletService(options.db);

  let rooms: RoomManager | null = null;
  const sockets = createSocketLayer({
    httpServer: app.server,
    auth: ctx,
    parseCookie: (header) => app.parseCookie(header),
    limits,
    rooms: () => rooms!,
    logError,
    checkOrigin: options.checkSocketOrigin ?? false,
  });
  rooms = new RoomManager({
    wallet,
    limits,
    randomInt: options.randomInt ?? ((max) => randomInt(max)),
    botRandom: options.botRandom ?? Math.random,
    events: sockets,
    logError,
  });
  const manager = rooms;

  await app.register(authRoutes, {
    ctx,
    secureCookies,
    hooks: {
      sessionsRevoked: (userId, keep) => sockets.disconnectUser(userId, '다른 곳에서 로그인했거나 로그아웃되어 접속을 종료합니다.', keep),
      beforeDeleteAccount: (userId) => {
        if (manager.roomOf(userId)) throw new Error('방에서 나온 뒤에 탈퇴할 수 있습니다.');
      },
      // 방 안에서는 자리 이름이 이미 정해져 있으므로 방에서 나온 뒤에 바꾸게 한다
      beforeChangeNickname: (userId) => {
        if (manager.roomOf(userId)) throw new Error('방에서 나온 뒤에 닉네임을 바꿀 수 있습니다.');
      },
      nicknameChanged: (userId, nickname) => sockets.renameUser(userId, nickname),
    },
  });
  await app.register(walletRoutes, {
    wallet,
    relief: options.relief ?? RELIEF_CHIP_CONFIG,
    requireAuth: makeRequireAuth(ctx, secureCookies),
    tableChipsOf: (userId) => manager.tableChipsOf(userId),
  });
  await app.register(statsRoutes, {
    db: options.db,
    config: options.records ?? DEFAULT_RECORDS_CONFIG,
    requireAuth: makeRequireAuth(ctx, secureCookies),
  });

  // 종료: 소켓을 먼저 끊고, 방을 모두 닫아 앉아 있던 칩을 지갑으로 돌려준다 (진행 중이던 판은 무효)
  app.addHook('preClose', async () => {
    sockets.io.disconnectSockets(true);
  });
  app.addHook('onClose', async () => {
    await manager.shutdown();
  });

  if (options.webRoot) await serveWeb(app, options.webRoot);
  app.setNotFoundHandler((request, reply) => {
    // 화면 쪽 경로는 index.html (새로 고침해도 화면이 뜨도록)
    if (options.webRoot && isWebRoute(request.method, request.url)) return reply.type('text/html').sendFile('index.html');
    return reply.code(404).send({ error: '찾을 수 없는 주소입니다.' });
  });
  return { app, rooms: manager, wallet, sockets };
}
