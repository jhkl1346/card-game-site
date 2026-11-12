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
  },
});
