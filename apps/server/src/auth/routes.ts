import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { CookieSerializeOptions } from '@fastify/cookie';
import type { z } from 'zod';
import type { CreatedSession, SessionUser } from './sessions.js';
import { deleteSessionByToken, findSession } from './sessions.js';
import {
  AuthError,
  changeNickname,
  changePassword,
  deleteAccount,
  getPublicUser,
  isNicknameTaken,
  isUsernameTaken,
  login,
  signup,
  type AuthContext,
} from './service.js';
import {
  changeNicknameSchema,
  changePasswordSchema,
  deleteAccountSchema,
  loginSchema,
  nicknameSchema,
  signupSchema,
  usernameSchema,
} from './validation.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** requireAuth를 거친 요청에서만 채워진다 */
    auth?: SessionUser;
  }
}

export interface AuthHooks {
  /** 이 사용자의 세션이 끊김(다른 곳 로그인, 로그아웃, 비밀번호 변경, 탈퇴): 연결된 소켓을 정리한다 */
  sessionsRevoked?(userId: string, keepSessionId?: string): void;
  /** 탈퇴 전 확인 (방에 앉아 있으면 막는 등). 막을 때는 사용자에게 보여 줄 메시지로 예외를 던진다 */
  beforeDeleteAccount?(userId: string): void;
}

export interface AuthRouteOptions {
  ctx: AuthContext;
  /** 배포(HTTPS)에서는 true. 로컬 http 개발에서는 false */
  secureCookies: boolean;
  hooks?: AuthHooks;
}

/**
 * 쿠키로 로그인 사용자를 확인하는 preHandler를 만든다. 만료가 연장되면 쿠키도 새 만료로 다시 보낸다.
 * 다른 라우트(지갑 등)에서도 같은 방식으로 쓴다.
 */
export function makeRequireAuth(ctx: AuthContext, secureCookies: boolean) {
  const { cookieName } = ctx.config;
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.cookies[cookieName];
    const session = token ? await findSession(ctx.db, token, ctx.now(), ctx.config) : null;
    if (!session) {
      if (token) reply.clearCookie(cookieName, { path: '/', httpOnly: true, secure: secureCookies, sameSite: 'lax' });
      throw new AuthError(401, '로그인이 필요합니다.');
    }
    if (session.refreshed && session.persistent) reply.setCookie(cookieName, token!, sessionCookieOptions(session, secureCookies));
    request.auth = session;
  };
}

function sessionCookieOptions(session: { persistent: boolean; expiresAt: Date }, secure: boolean): CookieSerializeOptions {
  return {
    httpOnly: true,
    secure,
    // 프론트와 API를 같은 도메인에서 제공하는 구성을 기본으로 한다 (docs/ARCHITECTURE.md 3장)
    sameSite: 'lax',
    path: '/',
    // 로그인 상태 유지를 끄면 만료를 넣지 않아 브라우저를 닫을 때 쿠키가 사라진다
    ...(session.persistent ? { expires: session.expiresAt } : {}),
  };
}

/** zod 오류를 첫 번째 메시지와 필드 이름으로 바꿔 400으로 돌려준다 */
function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body ?? {});
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new AuthError(400, issue?.message ?? '입력값이 올바르지 않습니다.', issue?.path[0]?.toString());
  }
  return result.data;
}

export async function authRoutes(app: FastifyInstance, { ctx, secureCookies, hooks = {} }: AuthRouteOptions): Promise<void> {
  const { cookieName } = ctx.config;

  const setSessionCookie = (reply: FastifyReply, token: string, session: { persistent: boolean; expiresAt: Date }) =>
    reply.setCookie(cookieName, token, sessionCookieOptions(session, secureCookies));

  const clearSessionCookie = (reply: FastifyReply) =>
    reply.clearCookie(cookieName, { path: '/', httpOnly: true, secure: secureCookies, sameSite: 'lax' });

  const requireAuth = makeRequireAuth(ctx, secureCookies);

  const startSession = (reply: FastifyReply, session: CreatedSession) => setSessionCookie(reply, session.token, session);

  // ── 가입·로그인 ──

  app.get('/api/auth/check-username', async (request) => {
    const { username } = request.query as { username?: unknown };
    const parsed = usernameSchema.safeParse(username);
    if (!parsed.success) return { available: false, message: parsed.error.issues[0]?.message };
    const taken = await isUsernameTaken(ctx, parsed.data);
    return { available: !taken, message: taken ? '이미 사용 중인 아이디입니다.' : '사용할 수 있는 아이디입니다.' };
  });

  app.get('/api/auth/check-nickname', async (request) => {
    const { nickname } = request.query as { nickname?: unknown };
    const parsed = nicknameSchema.safeParse(nickname);
    if (!parsed.success) return { available: false, message: parsed.error.issues[0]?.message };
    const taken = await isNicknameTaken(ctx, parsed.data);
    return { available: !taken, message: taken ? '이미 사용 중인 닉네임입니다.' : '사용할 수 있는 닉네임입니다.' };
  });

  /** 가입하면 바로 로그인된다 (로그인 상태 유지 기본값: 켜짐) */
  app.post('/api/auth/signup', async (request, reply) => {
    const input = parse(signupSchema, request.body);
    await signup(ctx, input);
    const { userId, session } = await login(ctx, {
      username: input.username,
      password: input.password,
      remember: input.remember ?? true,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
    startSession(reply, session);
    return reply.code(201).send({ user: await getPublicUser(ctx, userId) });
  });

  app.post('/api/auth/login', async (request, reply) => {
    const result = loginSchema.safeParse(request.body ?? {});
    if (!result.success) throw new AuthError(400, '아이디와 비밀번호를 입력해 주세요.');
    const { userId, session } = await login(ctx, {
      username: result.data.username,
      password: result.data.password,
      remember: result.data.remember ?? false,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
    // 다른 곳에 연결된 소켓은 "다른 곳에서 로그인" 안내 후 끊는다
    hooks.sessionsRevoked?.(userId);
    startSession(reply, session);
    return { user: await getPublicUser(ctx, userId) };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const token = request.cookies[cookieName];
    if (token) {
      const session = await findSession(ctx.db, token, ctx.now(), ctx.config);
      await deleteSessionByToken(ctx.db, token);
      if (session) hooks.sessionsRevoked?.(session.userId);
    }
    clearSessionCookie(reply);
    return { ok: true };
  });

  /** 자동 로그인: 쿠키가 유효하면 내 정보를 돌려준다 */
  app.get('/api/auth/me', { preHandler: requireAuth }, async (request) => {
    const user = await getPublicUser(ctx, request.auth!.userId);
    if (!user) throw new AuthError(401, '로그인이 필요합니다.');
    return { user };
  });

  // ── 계정 관리 ──

  app.patch('/api/account/nickname', { preHandler: requireAuth }, async (request) => {
    const { nickname } = parse(changeNicknameSchema, request.body);
    await changeNickname(ctx, request.auth!.userId, nickname);
    return { user: await getPublicUser(ctx, request.auth!.userId) };
  });

  app.post('/api/account/password', { preHandler: requireAuth }, async (request) => {
    const input = parse(changePasswordSchema, request.body);
    await changePassword(ctx, request.auth!.userId, request.auth!.sessionId, input);
    hooks.sessionsRevoked?.(request.auth!.userId, request.auth!.sessionId);
    return { ok: true };
  });

  app.post('/api/account/delete', { preHandler: requireAuth }, async (request, reply) => {
    const { password } = parse(deleteAccountSchema, request.body);
    try {
      hooks.beforeDeleteAccount?.(request.auth!.userId);
    } catch (error) {
      throw new AuthError(409, error instanceof Error ? error.message : '지금은 탈퇴할 수 없습니다.');
    }
    await deleteAccount(ctx, request.auth!.userId, password);
    hooks.sessionsRevoked?.(request.auth!.userId);
    clearSessionCookie(reply);
    return { ok: true };
  });
}
