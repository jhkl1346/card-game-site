import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // game-core를 빌드하지 않아도 TypeScript 소스를 바로 쓰도록 'source' 조건을 먼저 본다
    conditions: ['source'],
  },
  server: {
    port: 5173,
    // 개발 중에는 API 요청을 백엔드로 넘겨 같은 출처처럼 동작하게 한다 (세션 쿠키 SameSite=Lax 그대로 사용)
    proxy: {
      '/api': 'http://localhost:3001',
      '/health': 'http://localhost:3001',
    },
  },
});
