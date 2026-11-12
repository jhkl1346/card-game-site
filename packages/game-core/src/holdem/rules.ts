export type HoldemActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin';

export const HOLDEM_ACTION_LABELS: Readonly<Record<HoldemActionType, string>> = {
  fold: '폴드',
  check: '체크',
  call: '콜',
  bet: '벳',
  raise: '레이즈',
  allin: '올인',
};

export type HoldemStreet = 'preflop' | 'flop' | 'turn' | 'river';

export const HOLDEM_STREET_LABELS: Readonly<Record<HoldemStreet, string>> = {
  preflop: '프리플랍',
  flop: '플랍',
  turn: '턴',
  river: '리버',
};

/** 텍사스 홀덤 규칙 설정. 근거와 가정은 docs/rules/holdem.md 참고. */
export interface HoldemRules {
  /** 플랍을 펼치기 전 번 카드 1장 */
  burnBeforeFlop: boolean;
  /** 턴을 펼치기 전 번 카드 1장 */
  burnBeforeTurn: boolean;
  /** 리버를 펼치기 전 번 카드 1장 */
  burnBeforeRiver: boolean;
  /** 팟을 나누고 남는 칩을 줄 순서 */
  oddChipRule: 'leftOfButton';
}

export const DEFAULT_HOLDEM_RULES: Readonly<HoldemRules> = Object.freeze<HoldemRules>({
  burnBeforeFlop: true,
  burnBeforeTurn: true,
  burnBeforeRiver: true,
  oddChipRule: 'leftOfButton',
});
