import { defineConfig } from 'vitest/config';

export default defineConfig({
  // game-core를 빌드하지 않아도 TypeScript 소스를 바로 쓰도록 'source' 조건을 먼저 본다.
  // Vitest는 Node 테스트를 SSR 환경으로 실행하므로 ssr 쪽에도 넣는다.
  ssr: {
    resolve: {
      conditions: ['source'],
      externalConditions: ['source'],
    },
  },
  resolve: {
    conditions: ['source'],
  },
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
