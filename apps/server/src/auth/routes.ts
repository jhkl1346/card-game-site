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

export interface AuthRouteOptions {
  ctx: AuthContext;
  /** 배포(HTTPS)에서는 true. 로컬 http 개발에서는 false */
  secureCookies: boolean;
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

export async function authRoutes(app: FastifyInstance, { ctx, secureCookies }: AuthRouteOptions): Promise<void> {
  const { cookieName } = ctx.config;

  const cookieOptions = (session: { persistent: boolean; expiresAt: Date }): CookieSerializeOptions => ({
    httpOnly: true,
    secure: secureCookies,
    // 프론트와 API를 같은 도메인에서 제공하는 구성을 기본으로 한다 (docs/ARCHITECTURE.md 3장)
    sameSite: 'lax',
    path: '/',
    // 로그인 상태 유지를 끄면 만료를 넣지 않아 브라우저를 닫을 때 쿠키가 사라진다
    ...(session.persistent ? { expires: session.expiresAt } : {}),
  });

  const setSessionCookie = (reply: FastifyReply, token: string, session: { persistent: boolean; expiresAt: Date }) =>
    reply.setCookie(cookieName, token, cookieOptions(session));

  const clearSessionCookie = (reply: FastifyReply) =>
    reply.clearCookie(cookieName, { path: '/', httpOnly: true, secure: secureCookies, sameSite: 'lax' });

  /** 쿠키로 로그인 사용자를 확인한다. 만료가 연장되면 쿠키도 새 만료로 다시 보낸다 */
  const requireAuth = async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.cookies[cookieName];
    const session = token ? await findSession(ctx.db, token, ctx.now(), ctx.config) : null;
    if (!session) {
      if (token) clearSessionCookie(reply);
      throw new AuthError(401, '로그인이 필요합니다.');
    }
    if (session.refreshed && session.persistent) setSessionCookie(reply, token!, session);
    request.auth = session;
  };

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
    startSession(reply, session);
    return { user: await getPublicUser(ctx, userId) };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const token = request.cookies[cookieName];
    if (token) await deleteSessionByToken(ctx.db, token);
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
    return { ok: true };
  });

  app.post('/api/account/delete', { preHandler: requireAuth }, async (request, reply) => {
    const { password } = parse(deleteAccountSchema, request.body);
    await deleteAccount(ctx, request.auth!.userId, password);
    clearSessionCookie(reply);
    return { ok: true };
  });
}
