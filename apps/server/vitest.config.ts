import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // game-core를 빌드하지 않아도 TypeScript 소스를 바로 쓰도록 'source' 조건을 먼저 본다
    conditions: ['source'],
  },
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
