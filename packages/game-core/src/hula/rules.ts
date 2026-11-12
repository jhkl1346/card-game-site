/**
 * 훌라 지역/하우스 룰 설정. 근거와 가정은 docs/rules/hula.md 참고.
 */
export interface HulaRules {
  /** 조커 장수 (0이면 사용 안 함, 최대 2) */
  jokers: 0 | 1 | 2;
  /** 손에 남은 조커 점수 */
  jokerPoints: number;
  /** J/Q/K 점수: 'ten' = 각 10점, 'ranked' = 11/12/13점 */
  faceCardPoints: 'ten' | 'ranked';
  /** 런에서 A를 Q-K-A처럼 높게도 쓸 수 있는지 (A-2-3은 항상 가능, K-A-2는 항상 불가) */
  aceHighInRun: boolean;
  /** 남이 등록한 멜드에도 붙일 수 있는지 */
  layOffToOthers: boolean;
  /** 자기가 한 번이라도 등록한 뒤에만 붙이기를 할 수 있는지 (같은 턴에 등록한 직후부터 가능) */
  layOffRequiresMeld: boolean;
  /** 7은 한 장만으로도 등록할 수 있는지 (한국식 규칙) */
  sevenAlone: boolean;
  /** 버린 더미에서 가져오는 조건: 'mustUse' = 그 턴에 바로 멜드에 쓸 때만, 'free' = 자유 */
  discardPickup: 'mustUse' | 'free';
  /** 스톱 선언 사용 여부 */
  stopEnabled: boolean;
  /** 스톱을 선언할 수 있는 손패 점수 상한 */
  stopMaxPoints: number;
  /** 스톱 실패 시 선언자가 내는 배수 */
  stopFailMultiplier: number;
  /** 한 번도 등록하지 않다가 한 턴에 전부 털었을 때(훌라) 정산 배수 */
  hulaMultiplier: number;
  /** 정산 방식: 'points' = 남은 점수 × 점당 칩, 'fixed' = 고정 판돈 × 배수 */
  settlement: 'points' | 'fixed';
}

export const DEFAULT_HULA_RULES: Readonly<HulaRules> = Object.freeze<HulaRules>({
  jokers: 0,
  jokerPoints: 30,
  faceCardPoints: 'ten',
  aceHighInRun: true,
  layOffToOthers: true,
  layOffRequiresMeld: true,
  sevenAlone: true,
  discardPickup: 'mustUse',
  stopEnabled: true,
  stopMaxPoints: 10,
  stopFailMultiplier: 2,
  hulaMultiplier: 2,
  settlement: 'points',
});

export type HulaActionType = 'drawDeck' | 'drawDiscard' | 'stop' | 'meld' | 'layoff' | 'discard';

export const HULA_ACTION_LABELS: Readonly<Record<HulaActionType, string>> = {
  drawDeck: '덱에서 가져오기',
  drawDiscard: '버린 카드 가져오기',
  stop: '스톱',
  meld: '등록',
  layoff: '붙이기',
  discard: '버리기',
};
