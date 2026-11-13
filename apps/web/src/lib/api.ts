/**
 * 서버 주소. 같은 도메인으로 배포하면 비워 두고, 다른 도메인이면 VITE_SERVER_URL로 지정한다.
 * (세션 쿠키를 함께 보내야 하므로 credentials: 'include')
 */
export const API_BASE = (import.meta.env.VITE_SERVER_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export interface PublicUser {
  id: string;
  username: string;
  nickname: string;
  balance: number;
}

export interface WalletInfo {
  balance: number;
  tableChips: number;
  canClaimRelief: boolean;
  reliefAmount: number;
}

export type StatGameType = 'stud7' | 'holdem' | 'hula';

export interface GameStat {
  gameType: StatGameType;
  played: number;
  wins: number;
  chipNet: number;
  bestWin: number;
}

export interface MyStats {
  perGame: GameStat[];
  total: Omit<GameStat, 'gameType'>;
  recent: Array<{ gameId: string; gameType: StatGameType; endedAt: string; chipDelta: number; rank: number; players: number }>;
}

export interface RankingEntry {
  rank: number;
  nickname: string;
  chips: number;
  isMe: boolean;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_BASE + path, {
      method,
      credentials: 'include',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? null : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, '서버에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.');
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message = typeof data.error === 'string' ? data.error : '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
    throw new ApiError(res.status, message, typeof data.field === 'string' ? data.field : undefined);
  }
  return data as T;
}

export const api = {
  me: () => request<{ user: PublicUser }>('GET', '/api/auth/me'),
  login: (input: { username: string; password: string; remember: boolean }) =>
    request<{ user: PublicUser }>('POST', '/api/auth/login', input),
  signup: (input: { username: string; password: string; passwordConfirm: string; nickname: string; remember: boolean }) =>
    request<{ user: PublicUser }>('POST', '/api/auth/signup', input),
  logout: () => request<{ ok: true }>('POST', '/api/auth/logout'),
  checkUsername: (username: string) =>
    request<{ available: boolean; message?: string }>('GET', `/api/auth/check-username?username=${encodeURIComponent(username)}`),
  checkNickname: (nickname: string) =>
    request<{ available: boolean; message?: string }>('GET', `/api/auth/check-nickname?nickname=${encodeURIComponent(nickname)}`),
  wallet: () => request<WalletInfo>('GET', '/api/wallet'),
  claimRelief: () => request<{ amount: number; balance: number }>('POST', '/api/wallet/relief'),
  stats: () => request<MyStats>('GET', '/api/stats/me'),
  ranking: () => request<{ top: RankingEntry[]; me: RankingEntry | null }>('GET', '/api/ranking'),
  changeNickname: (nickname: string) => request<{ user: PublicUser }>('PATCH', '/api/account/nickname', { nickname }),
  changePassword: (input: { currentPassword: string; newPassword: string; newPasswordConfirm: string }) =>
    request<{ ok: true }>('POST', '/api/account/password', input),
  deleteAccount: (password: string) => request<{ ok: true }>('POST', '/api/account/delete', { password }),
};

/**
 * 무료 서버가 잠들어 있으면 첫 응답이 늦다. /health가 응답할 때까지 기다린다.
 * onSlow는 일정 시간 안에 응답이 없을 때 한 번 불린다 ("서버를 깨우는 중입니다" 안내용).
 */
export async function waitForServer(onSlow: () => void, signal: AbortSignal): Promise<void> {
  const slowTimer = setTimeout(onSlow, 1_500);
  try {
    for (let attempt = 0; !signal.aborted; attempt++) {
      try {
        const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]) });
        if (res.ok) return;
      } catch {
        // 아직 깨어나는 중
      }
      onSlow();
      await new Promise((r) => setTimeout(r, Math.min(1_000 + attempt * 500, 4_000)));
    }
  } finally {
    clearTimeout(slowTimer);
  }
}
