import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';

/**
 * 배포 구성(docs/deploy-report.md): 서버 하나가 API·Socket.IO와 빌드된 화면 파일을 함께 제공한다.
 * 같은 주소라 로그인 쿠키를 SameSite=Lax 그대로 쓰고 CORS가 필요 없다.
 */
export async function serveWeb(app: FastifyInstance, root: string): Promise<void> {
  if (!existsSync(join(root, 'index.html'))) throw new Error(`화면 빌드 파일이 없습니다: ${root} (pnpm build 먼저 실행)`);
  await app.register(fastifyStatic, {
    root,
    wildcard: false,
    index: ['index.html'],
    // 파일 이름에 해시가 붙는 assets/는 오래 캐시하고, index.html은 매번 새로 확인한다
    setHeaders(res, path) {
      res.header('cache-control', /[\\/]assets[\\/]/.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache');
    },
  });
}

/** 화면 경로(/, /lobby 등)는 index.html로, API·소켓 경로는 그대로 404 JSON */
export function isWebRoute(method: string, url: string): boolean {
  return method === 'GET' && !url.startsWith('/api/') && !url.startsWith('/socket.io') && !url.startsWith('/health');
}

/**
 * 보안 헤더. 외부 스크립트·폰트를 쓰지 않으므로(폰트는 빌드에 포함) 자기 출처만 허용한다.
 * Framer Motion과 React의 style 속성 때문에 style-src에 'unsafe-inline'이 필요하다.
 */
export function securityHeaders(app: FastifyInstance, production: boolean): void {
  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'same-origin');
    reply.header('x-frame-options', 'DENY');
    reply.header('permissions-policy', 'camera=(), microphone=(), geolocation=()');
    if (production) reply.header('strict-transport-security', 'max-age=15552000');
    const type = String(reply.getHeader('content-type') ?? '');
    if (type.startsWith('text/html')) {
      // 일부 브라우저는 connect-src 'self'를 wss:에 적용하지 않으므로 같은 호스트의 wss를 명시한다
      const host = request.host;
      reply.header(
        'content-security-policy',
        [
          "default-src 'self'",
          "script-src 'self'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data:",
          "font-src 'self'",
          `connect-src 'self' wss://${host}${production ? '' : ` ws://${host}`}`,
          "frame-ancestors 'none'",
          "base-uri 'none'",
          "form-action 'self'",
          "object-src 'none'",
        ].join('; '),
      );
    }
    return payload;
  });
}
