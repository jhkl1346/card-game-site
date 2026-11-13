/**
 * 전적·랭킹 설정. 무료 DB 용량을 아끼려고 판별 기록은 보관 기간이 지나면 지운다.
 * (게임별 누적 전적 user_stats는 지우지 않는다)
 */
export interface RecordsConfig {
  /** 판별 기록(game_results) 보관 기간 (일) */
  gameResultRetentionDays: number;
  /** 내 정보 화면에 보여 줄 최근 판 수 */
  recentGames: number;
  /** 칩 랭킹에 보여 줄 인원 */
  rankingSize: number;
}

export const DEFAULT_RECORDS_CONFIG: Readonly<RecordsConfig> = Object.freeze<RecordsConfig>({
  gameResultRetentionDays: 90,
  recentGames: 20,
  rankingSize: 50,
});
