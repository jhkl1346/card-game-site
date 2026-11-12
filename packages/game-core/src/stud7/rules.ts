import type { Suit } from '../cards/card.js';

export type Stud7ActionType = 'bbing' | 'check' | 'call' | 'ddadang' | 'quarter' | 'half' | 'full' | 'die';

export const STUD7_ACTION_LABELS: Readonly<Record<Stud7ActionType, string>> = {
  bbing: '삥',
  check: '체크',
  call: '콜',
  ddadang: '따당',
  quarter: '쿼터',
  half: '하프',
  full: '풀',
  die: '다이',
};

/** 레이즈로 세는 액션 (삥은 첫 베팅이라 세지 않음) */
export const STUD7_RAISE_ACTIONS: readonly Stud7ActionType[] = ['ddadang', 'quarter', 'half', 'full'];

/**
 * 7포커 지역/하우스 룰 설정. 근거와 가정은 docs/rules/stud7.md 참고.
 */
export interface Stud7Rules {
  /** 첫 베팅 라운드를 시작하는 사람 */
  firstRoundStarter: 'lowestOpenCard' | 'highestOpenCard';
  /** 2라운드부터 시작하는 사람 */
  laterRoundStarter: 'highestOpenHand';
  /** 공개 카드 비교에서 숫자가 같을 때의 무늬 순서 (앞이 높음) */
  suitRank: readonly Suit[];
  /** 최종 족보가 완전히 같을 때 무늬로 승자를 가릴지 (false면 팟 분할) */
  tieBreakBySuit: boolean;
  /** 한 라운드에 한 사람이 할 수 있는 레이즈 횟수. null이면 제한 없음 */
  maxRaisesPerRound: number | null;
  /** 베팅 상한 액션 */
  maxBetAction: 'full' | 'half';
  /** 첫 라운드(3장째)에서 쓸 수 있는 액션 */
  firstRoundActions: readonly Stud7ActionType[];
  /** 쿼터·하프·풀 계산 기준 판돈: 콜한 뒤(afterCall) / 콜하기 전(beforeCall) */
  potBetBase: 'afterCall' | 'beforeCall';
}

export const DEFAULT_STUD7_RULES: Readonly<Stud7Rules> = Object.freeze<Stud7Rules>({
  firstRoundStarter: 'lowestOpenCard',
  laterRoundStarter: 'highestOpenHand',
  suitRank: ['S', 'D', 'H', 'C'],
  tieBreakBySuit: false,
  maxRaisesPerRound: 2,
  maxBetAction: 'full',
  firstRoundActions: ['bbing', 'check', 'call', 'ddadang', 'quarter', 'half', 'full', 'die'],
  potBetBase: 'afterCall',
});

/** 무늬 강도 (클수록 높음) */
export function suitStrength(rules: Pick<Stud7Rules, 'suitRank'>, suit: Suit): number {
  return rules.suitRank.length - rules.suitRank.indexOf(suit);
}
