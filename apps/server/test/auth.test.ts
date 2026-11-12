import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LOGIN_FAILED_MESSAGE } from '../src/auth/service.js';
import { hashSessionToken } from '../src/auth/sessions.js';
import { chipLogs, sessions, users, wallets } from '../src/db/schema.js';
import { createTestServer, DAY, HOUR, MINUTE, sessionCookie, validSignup, type TestServer } from './helpers.js';

let s: TestServer;
beforeAll(async () => {
  s = await createTestServer();
});
beforeEach(async () => {
  await s.reset();
});
afterAll(async () => {
  await s.close();
});

const post = (url: string, payload: unknown, cookie?: string, ip = '10.0.0.1') =>
  s.app.inject({ method: 'POST', url, payload: payload as object, remoteAddress: ip, ...(cookie ? { cookies: { sid: cookie } } : {}) });
const get = (url: string, cookie?: string) => s.app.inject({ method: 'GET', url, ...(cookie ? { cookies: { sid: cookie } } : {}) });
const login = (username: string, password: string, remember = false, ip?: string) =>
  post('/api/auth/login', { username, password, remember }, undefined, ip);

async function signupAndCookie(overrides: Record<string, unknown> = {}): Promise<string> {
  const res = await post('/api/auth/signup', validSignup(overrides));
  expect(res.statusCode).toBe(201);
  return sessionCookie(res)!.value;
}

describe('회원가입', () => {
  it('가입하면 기본 칩 10,000개 지갑과 signup 칩 기록이 생기고 바로 로그인된다', async () => {
    const res = await post('/api/auth/signup', validSignup());
    expect(res.statusCode).toBe(201);
    expect(res.json().user).toMatchObject({ username: 'player01', nickname: '하늘', balance: 10_000 });
    const cookie = res.cookies.find((c) => c.name === 'sid')!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe('Lax');

    const [user] = await s.handle.db.select().from(users);
    const [wallet] = await s.handle.db.select().from(wallets);
    const logs = await s.handle.db.select().from(chipLogs);
    expect(wallet!.balance).toBe(10_000);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ delta: 10_000, reason: 'signup', userId: user!.id });
  });

  it('비밀번호는 argon2id 해시로만 저장된다', async () => {
    await post('/api/auth/signup', validSignup());
    const [user] = await s.handle.db.select().from(users);
    expect(user!.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(user!.passwordHash).not.toContain('abcd1234');
  });

  it('세션 토큰은 DB에 해시로만 저장된다', async () => {
    const token = await signupAndCookie();
    const rows = await s.handle.db.select().from(sessions);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).toBe(hashSessionToken(token));
    expect(rows[0]!.tokenHash).not.toBe(token);
  });

  it.each([
    [{ username: 'ab1' }, 'username'],
    [{ username: 'Player01' }, 'username'],
    [{ username: 'a'.repeat(21) }, 'username'],
    [{ password: 'abcdefgh', passwordConfirm: 'abcdefgh' }, 'password'],
    [{ password: '12345678', passwordConfirm: '12345678' }, 'password'],
    [{ password: 'abc123', passwordConfirm: 'abc123' }, 'password'],
    [{ passwordConfirm: 'abcd12345' }, 'passwordConfirm'],
    [{ nickname: '하' }, 'nickname'],
    [{ nickname: '가나다라마바사아자차카타파' }, 'nickname'],
    [{ nickname: '<script>' }, 'nickname'],
    [{ nickname: '씨_발' }, 'nickname'],
    [{ nickname: 'ADMIN1' }, 'nickname'],
  ])('잘못된 입력 %j는 거절된다', async (overrides, field) => {
    const res = await post('/api/auth/signup', validSignup(overrides));
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe(field);
    expect(await s.handle.db.select().from(users)).toHaveLength(0);
  });

  it('아이디와 닉네임(대소문자 무시)은 중복될 수 없다', async () => {
    await signupAndCookie({ nickname: 'Sky' });
    const dupUser = await post('/api/auth/signup', validSignup({ nickname: '다른닉' }));
    expect(dupUser.statusCode).toBe(409);
    expect(dupUser.json()).toMatchObject({ field: 'username', error: '이미 사용 중인 아이디입니다.' });
    const dupNick = await post('/api/auth/signup', validSignup({ username: 'player02', nickname: 'sky' }));
    expect(dupNick.statusCode).toBe(409);
    expect(dupNick.json().field).toBe('nickname');
    // 실패한 가입은 지갑·칩 기록을 남기지 않는다
    expect(await s.handle.db.select().from(wallets)).toHaveLength(1);
    expect(await s.handle.db.select().from(chipLogs)).toHaveLength(1);
  });

  it('아이디·닉네임 실시간 중복 확인', async () => {
    expect((await get('/api/auth/check-username?username=player01')).json().available).toBe(true);
    await signupAndCookie();
    expect((await get('/api/auth/check-username?username=player01')).json()).toEqual({
      available: false,
      message: '이미 사용 중인 아이디입니다.',
    });
    expect((await get('/api/auth/check-username?username=AB')).json().available).toBe(false);
    expect((await get(`/api/auth/check-nickname?nickname=${encodeURIComponent('하늘')}`)).json().available).toBe(false);
    expect((await get(`/api/auth/check-nickname?nickname=${encodeURIComponent('바다')}`)).json().available).toBe(true);
  });
});

describe('로그인과 세션', () => {
  beforeEach(async () => {
    await signupAndCookie();
  });

  it('로그인 상태 유지를 켜면 30일 쿠키, 끄면 브라우저 세션 쿠키가 발급된다', async () => {
    const remembered = sessionCookie(await login('player01', 'abcd1234', true))!;
    expect(remembered.expires!.getTime()).toBe(s.clock.now.getTime() + 30 * DAY);
    const browserOnly = sessionCookie(await login('player01', 'abcd1234', false))!;
    expect(browserOnly.expires).toBeUndefined();
  });

  it('쿠키로 자동 로그인(/me)되고, 쿠키가 없거나 틀리면 401', async () => {
    const token = sessionCookie(await login('player01', 'abcd1234', true))!.value;
    const me = await get('/api/auth/me', token);
    expect(me.statusCode).toBe(200);
    expect(me.json().user).toMatchObject({ username: 'player01', nickname: '하늘', balance: 10_000 });
    expect((await get('/api/auth/me')).statusCode).toBe(401);
    expect((await get('/api/auth/me', 'wrong-token')).statusCode).toBe(401);
  });

  it('접속할 때마다 만료가 30일로 연장된다', async () => {
    const token = sessionCookie(await login('player01', 'abcd1234', true))!.value;
    for (let i = 0; i < 3; i++) {
      s.clock.advance(20 * DAY);
      const me = await get('/api/auth/me', token);
      expect(me.statusCode).toBe(200);
      expect(sessionCookie(me)!.expires!.getTime()).toBe(s.clock.now.getTime() + 30 * DAY);
    }
    // 30일 넘게 접속하지 않으면 만료
    s.clock.advance(31 * DAY);
    expect((await get('/api/auth/me', token)).statusCode).toBe(401);
  });

  it('로그인 상태 유지를 끄면 서버 쪽 세션도 12시간 뒤 만료된다', async () => {
    const token = sessionCookie(await login('player01', 'abcd1234', false))!.value;
    s.clock.advance(11 * HOUR);
    expect((await get('/api/auth/me', token)).statusCode).toBe(200);
    s.clock.advance(13 * HOUR);
    expect((await get('/api/auth/me', token)).statusCode).toBe(401);
  });

  it('로그아웃하면 서버 세션이 지워진다', async () => {
    const token = sessionCookie(await login('player01', 'abcd1234', true))!.value;
    const res = await post('/api/auth/logout', {}, token);
    expect(res.statusCode).toBe(200);
    expect(sessionCookie(res)!.value).toBe('');
    expect((await get('/api/auth/me', token)).statusCode).toBe(401);
    expect(await s.handle.db.select().from(sessions)).toHaveLength(0);
  });

  it('다른 곳에서 로그인하면 기존 세션이 끊긴다', async () => {
    const first = sessionCookie(await login('player01', 'abcd1234', true))!.value;
    const second = sessionCookie(await login('player01', 'abcd1234', true))!.value;
    expect((await get('/api/auth/me', first)).statusCode).toBe(401);
    expect((await get('/api/auth/me', second)).statusCode).toBe(200);
  });

  it('틀린 비밀번호와 없는 아이디는 같은 메시지로 실패한다', async () => {
    const wrongPw = await login('player01', 'wrong1234');
    const noUser = await login('nobody99', 'abcd1234');
    expect(wrongPw.statusCode).toBe(401);
    expect(noUser.statusCode).toBe(401);
    expect(wrongPw.json().error).toBe(LOGIN_FAILED_MESSAGE);
    expect(noUser.json()).toEqual(wrongPw.json());
  });
});

describe('로그인 실패 제한', () => {
  beforeEach(async () => {
    await signupAndCookie();
  });

  it('5번 실패하면 맞는 비밀번호도 15분간 막히고, 지나면 다시 로그인된다', async () => {
    for (let i = 0; i < 5; i++) expect((await login('player01', 'wrong1234')).statusCode).toBe(401);
    const locked = await login('player01', 'abcd1234');
    expect(locked.statusCode).toBe(429);
    expect(locked.json().error).toContain('15분');

    s.clock.advance(14 * MINUTE);
    expect((await login('player01', 'abcd1234')).statusCode).toBe(429);
    s.clock.advance(2 * MINUTE);
    expect((await login('player01', 'abcd1234')).statusCode).toBe(200);
  });

  it('4번 실패 후 성공하면 그 아이디의 실패 횟수가 초기화된다', async () => {
    for (let i = 0; i < 4; i++) await login('player01', 'wrong1234', false, '10.0.0.1');
    expect((await login('player01', 'abcd1234', false, '10.0.0.1')).statusCode).toBe(200);
    for (let i = 0; i < 4; i++) await login('player01', 'wrong1234', false, '10.0.0.2');
    expect((await login('player01', 'abcd1234', false, '10.0.0.2')).statusCode).toBe(200);
  });

  it('IP 실패 횟수는 로그인에 성공해도 초기화되지 않는다 (내 계정 로그인으로 남의 계정 찔러 보기 방지)', async () => {
    for (let i = 0; i < 4; i++) await login('player01', 'wrong1234');
    expect((await login('player01', 'abcd1234')).statusCode).toBe(200);
    await login('player01', 'wrong1234');
    expect((await login('player01', 'abcd1234')).statusCode).toBe(429);
  });

  it('마지막 실패 후 15분이 지나면 실패 횟수를 처음부터 센다', async () => {
    for (let i = 0; i < 4; i++) await login('player01', 'wrong1234');
    s.clock.advance(16 * MINUTE);
    for (let i = 0; i < 4; i++) await login('player01', 'wrong1234');
    expect((await login('player01', 'abcd1234')).statusCode).toBe(200);
  });

  it('아이디 잠금은 다른 IP에서도 유지된다', async () => {
    for (let i = 0; i < 5; i++) await login('player01', 'wrong1234', false, `10.0.1.${i}`);
    expect((await login('player01', 'abcd1234', false, '10.9.9.9')).statusCode).toBe(429);
  });

  it('같은 IP에서 여러 아이디로 5번 실패하면 그 IP가 잠긴다', async () => {
    for (let i = 0; i < 5; i++) await login(`guess${i}aaa`, 'wrong1234', false, '10.0.0.50');
    expect((await login('player01', 'abcd1234', false, '10.0.0.50')).statusCode).toBe(429);
    expect((await login('player01', 'abcd1234', false, '10.0.0.51')).statusCode).toBe(200);
  });

  it('없는 아이디도 똑같이 잠겨서 존재 여부가 드러나지 않는다', async () => {
    for (let i = 0; i < 5; i++) await login('nobody99', 'wrong1234', false, `10.0.2.${i}`);
    expect((await login('nobody99', 'wrong1234', false, '10.0.3.1')).statusCode).toBe(429);
  });
});

describe('계정 관리', () => {
  let token: string;
  beforeEach(async () => {
    token = await signupAndCookie();
  });

  it('닉네임 변경 (중복·금칙어는 거절)', async () => {
    await signupAndCookie({ username: 'player02', nickname: '바다' });
    const patch = (nickname: string) =>
      s.app.inject({ method: 'PATCH', url: '/api/account/nickname', payload: { nickname }, cookies: { sid: token } });
    expect((await patch('바다')).statusCode).toBe(409);
    expect((await patch('시발놈')).statusCode).toBe(400);
    const ok = await patch('  구름  ');
    expect(ok.statusCode).toBe(200);
    expect(ok.json().user.nickname).toBe('구름');
    // 자기 닉네임의 대소문자만 바꾸는 것은 허용
    expect((await patch('구름')).statusCode).toBe(200);
  });

  it('로그인하지 않으면 계정 API를 쓸 수 없다', async () => {
    const res = await s.app.inject({ method: 'PATCH', url: '/api/account/nickname', payload: { nickname: '구름' } });
    expect(res.statusCode).toBe(401);
  });

  it('비밀번호 변경: 현재 비밀번호 확인 필수, 바꾸면 다른 접속은 끊긴다', async () => {
    const change = (body: object, cookie = token) => post('/api/account/password', body, cookie);
    const wrong = await change({ currentPassword: 'nope1234', newPassword: 'newpass99', newPasswordConfirm: 'newpass99' });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json().field).toBe('currentPassword');
    expect(
      (await change({ currentPassword: 'abcd1234', newPassword: 'short1', newPasswordConfirm: 'short1' })).statusCode,
    ).toBe(400);

    // 같은 계정의 다른 세션을 하나 더 만든다 (로그인은 기존 세션을 끊으므로 DB에 직접 추가)
    const [user] = await s.handle.db.select().from(users).where(eq(users.username, 'player01'));
    await s.handle.db.insert(sessions).values({
      userId: user!.id,
      tokenHash: hashSessionToken('other-device'),
      expiresAt: new Date(s.clock.now.getTime() + DAY),
      persistent: true,
    });

    const ok = await change({ currentPassword: 'abcd1234', newPassword: 'newpass99', newPasswordConfirm: 'newpass99' });
    expect(ok.statusCode).toBe(200);
    expect((await get('/api/auth/me', token)).statusCode).toBe(200);
    expect((await get('/api/auth/me', 'other-device')).statusCode).toBe(401);
    expect((await login('player01', 'abcd1234')).statusCode).toBe(401);
    expect((await login('player01', 'newpass99')).statusCode).toBe(200);
  });

  it('회원 탈퇴: 비밀번호 확인 후 익명 처리되고 같은 아이디로 다시 가입할 수 있다', async () => {
    expect((await post('/api/account/delete', { password: 'wrong1234' }, token)).statusCode).toBe(400);
    const res = await post('/api/account/delete', { password: 'abcd1234' }, token);
    expect(res.statusCode).toBe(200);

    expect((await get('/api/auth/me', token)).statusCode).toBe(401);
    expect((await login('player01', 'abcd1234')).statusCode).toBe(401);
    const [deleted] = await s.handle.db.select().from(users);
    expect(deleted!.deletedAt).not.toBeNull();
    expect(deleted!.passwordHash).toBe('');
    expect(deleted!.username).not.toBe('player01');
    expect(deleted!.nickname.startsWith('탈퇴회원_')).toBe(true);
    expect(await s.handle.db.select().from(wallets)).toHaveLength(0);

    expect((await post('/api/auth/signup', validSignup())).statusCode).toBe(201);
  });
});

describe('기타', () => {
  it('헬스 체크와 없는 주소', async () => {
    expect((await get('/health')).json()).toEqual({ ok: true, deckSize: 52 });
    const missing = await get('/api/nothing');
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error).toBe('찾을 수 없는 주소입니다.');
  });

  it('JSON이 아닌 본문은 400', async () => {
    const res = await s.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: '{broken',
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(400);
  });
});
