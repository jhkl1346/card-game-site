/**
 * 인증·계정 관련 설정. 숫자를 바꿀 때는 여기만 고친다.
 */
export interface AuthConfig {
  /** 로그인 상태 유지 시 세션 만료 (일). 요청마다 다시 이 기간으로 연장 */
  persistentSessionDays: number;
  /** 로그인 상태 유지를 끈 경우 서버 쪽 세션 만료 (시간). 쿠키는 브라우저를 닫으면 사라진다 */
  browserSessionHours: number;
  /** 세션 만료 연장을 DB에 쓰는 최소 간격 (분). 요청마다 쓰지 않도록 줄인다 */
  sessionTouchIntervalMinutes: number;
  /** 로그인 실패 몇 번에 잠글지 */
  maxLoginFailures: number;
  /** 잠금 시간 (분) */
  lockMinutes: number;
  /** 가입 시 기본 지급 칩 */
  signupChips: number;
  /** 세션 쿠키 이름 */
  cookieName: string;
  /**
   * argon2id 비용. 기본값은 OWASP 권장 최소치(메모리 19MiB, 반복 2, 병렬 1).
   * 테스트에서만 낮춰서 빠르게 돌린다.
   */
  argon2: { memoryCost: number; timeCost: number; parallelism: number };
}

export const DEFAULT_AUTH_CONFIG: Readonly<AuthConfig> = Object.freeze<AuthConfig>({
  persistentSessionDays: 30,
  browserSessionHours: 12,
  sessionTouchIntervalMinutes: 60,
  maxLoginFailures: 5,
  lockMinutes: 15,
  signupChips: 10_000,
  cookieName: 'sid',
  argon2: { memoryCost: 19_456, timeCost: 2, parallelism: 1 },
});

/** 구제 칩 설정 (지급 로직은 6단계에서 구현) */
export interface ReliefChipConfig {
  amount: number;
  requiredBalance: 0;
}

export const RELIEF_CHIP_CONFIG: Readonly<ReliefChipConfig> = Object.freeze<ReliefChipConfig>({
  amount: 5_000,
  requiredBalance: 0,
});
