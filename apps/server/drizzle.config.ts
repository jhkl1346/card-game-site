import { defineConfig } from 'drizzle-kit';

// 마이그레이션 SQL 생성용: pnpm --filter @card-game/server db:generate
// DB에 접속하지 않고 스키마 파일만 읽는다.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
});
