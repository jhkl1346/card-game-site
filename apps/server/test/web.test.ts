import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io as connect } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestServer, sessionCookie, validSignup, type TestServer } from './helpers.js';

let s: TestServer;
let root: string;

beforeAll(async () => {
  // 빌드된 화면을 흉내 낸 임시 폴더
  root = mkdtempSync(join(tmpdir(), 'card-web-'));
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'index.html'), '<!doctype html><title>카드 게임</title>');
  writeFileSync(join(root, 'assets', 'app-abc123.js'), 'console.log(1)');
  s = await createTestServer({ webRoot: root, secureCookies: true, checkSocketOrigin: true });
});
afterAll(async () => {
  await s.close();
  rmSync(root, { recursive: true, force: true });
});

describe('화면 파일 제공 (한 주소 배포)', () => {
  it('첫 화면과 새로 고침한 화면 경로에 index.html을 준다', async () => {
    for (const url of ['/', '/lobby']) {
      const res = await s.app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.body).toContain('카드 게임');
    }
  });

  it('해시가 붙은 파일은 오래 캐시하고, index.html은 매번 확인한다', async () => {
    const asset = await s.app.inject({ method: 'GET', url: '/assets/app-abc123.js' });
    expect(asset.headers['cache-control']).toContain('immutable');
    const html = await s.app.inject({ method: 'GET', url: '/' });
    expect(html.headers['cache-control']).toBe('no-cache');
  });

  it('없는 API 경로는 화면이 아니라 404 JSON', async () => {
    const res = await s.app.inject({ method: 'GET', url: '/api/nothing' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBeTruthy();
  });

  it('보안 헤더를 붙이고, 화면에는 자기 출처만 허용하는 CSP를 붙인다', async () => {
    const html = await s.app.inject({ method: 'GET', url: '/', headers: { host: 'game.example.com' } });
    expect(html.headers['x-content-type-options']).toBe('nosniff');
    expect(html.headers['x-frame-options']).toBe('DENY');
    expect(html.headers['strict-transport-security']).toBeTruthy();
    const csp = String(html.headers['content-security-policy']);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain('wss://game.example.com');
    const api = await s.app.inject({ method: 'GET', url: '/health' });
    expect(api.headers['x-content-type-options']).toBe('nosniff');
    expect(api.headers['content-security-policy']).toBeUndefined();
  });
});

describe('소켓 출처 확인', () => {
  it('다른 사이트에서 연 소켓은 로그인 쿠키가 있어도 거절한다', async () => {
    await s.app.listen({ port: 0, host: '127.0.0.1' });
    const port = (s.app.server.address() as AddressInfo).port;
    const res = await s.app.inject({ method: 'POST', url: '/api/auth/signup', payload: validSignup() });
    const cookie = `sid=${sessionCookie(res)!.value}`;
    const url = `http://127.0.0.1:${port}`;
    const tryOpen = (origin: string) =>
      new Promise<boolean>((resolve) => {
        const socket = connect(url, { transports: ['polling'], forceNew: true, reconnection: false, extraHeaders: { cookie, origin } });
        socket.on('connect', () => {
          socket.disconnect();
          resolve(true);
        });
        socket.on('connect_error', () => {
          socket.disconnect();
          resolve(false);
        });
      });
    expect(await tryOpen('https://evil.example.com')).toBe(false);
    expect(await tryOpen(url)).toBe(true);
  });
});
