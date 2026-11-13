import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 환경 변수 읽기. 저장소 루트의 .env가 있으면 먼저 불러온다(이미 설정된 값은 덮어쓰지 않음).
 * 실제 비밀 값은 .env 또는 호스팅 환경 변수에만 두고 커밋하지 않는다.
 */
export interface ServerEnv {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  /**
   * DB 접속 정보
   * - 비어 있음: 로컬 PGlite 파일(apps/server/data/pglite)
   * - "memory://": 메모리 PGlite (테스트용, 종료하면 사라짐)
   * - "pglite:경로": 지정한 경로의 PGlite 파일
   * - "postgres://..." / "postgresql://...": 외부 PostgreSQL (배포)
   */
  databaseUrl: string;
  /** 리버스 프록시 뒤에서 실행할 때 X-Forwarded-For를 믿을지 (로그인 IP 제한에 사용) */
  trustProxy: boolean;
  /** 빌드된 화면 파일 폴더. production에서 기본값은 apps/web/dist (있을 때만) */
  webRoot: string | null;
  /** 동시에 열 수 있는 방 수 (무료 서버 메모리에 맞춰 조정) */
  maxRooms: number | null;
}

export function loadEnv(): ServerEnv {
  const envFile = resolve(import.meta.dirname, '../../../../.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const nodeEnv = process.env.NODE_ENV;
  return {
    nodeEnv: nodeEnv === 'production' || nodeEnv === 'test' ? nodeEnv : 'development',
    port: Number(process.env.PORT ?? 3001),
    databaseUrl: process.env.DATABASE_URL ?? '',
    trustProxy: process.env.TRUST_PROXY === 'true',
    webRoot: resolveWebRoot(process.env.WEB_ROOT, nodeEnv === 'production'),
    maxRooms: positiveInt(process.env.MAX_ROOMS),
  };
}

function resolveWebRoot(value: string | undefined, production: boolean): string | null {
  if (value === 'off') return null;
  if (value) return resolve(value);
  const built = resolve(import.meta.dirname, '../../../web/dist');
  return production && existsSync(resolve(built, 'index.html')) ? built : null;
}

function positiveInt(value: string | undefined): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}
