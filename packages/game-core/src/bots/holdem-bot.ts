import type { Card } from '../cards/card.js';
import { evaluateHand, HandCategory } from '../hand/evaluate.js';
import type { HoldemAction, HoldemLegalAction, HoldemView } from '../holdem/engine.js';
import { BOT_CONFIG, type BotConfig, type BotRandom } from './config.js';

const MADE_STRENGTH: Readonly<Record<HandCategory, number>> = {
  [HandCategory.HighCard]: 0.1,
  [HandCategory.OnePair]: 0.42,
  [HandCategory.TwoPair]: 0.66,
  [HandCategory.Trips]: 0.76,
  [HandCategory.Straight]: 0.83,
  [HandCategory.Flush]: 0.87,
  [HandCategory.FullHouse]: 0.94,
  [HandCategory.Quads]: 0.98,
  [HandCategory.StraightFlush]: 0.99,
  [HandCategory.RoyalFlush]: 1,
};

/** 프리플랍 홀카드 강도 (Chen 공식을 단순화한 근사, 0~1) */
export function preflopStrength(hole: readonly Card[]): number {
  const [a, b] = hole as [Card, Card];
  const hi = Math.max(a.rank, b.rank);
  const lo = Math.min(a.rank, b.rank);
  if (hi === lo) return 0.5 + ((hi - 2) / 12) * 0.45;
  let s = ((hi - 2) / 12) * 0.36 + ((lo - 2) / 12) * 0.16;
  if (a.suit === b.suit) s += 0.06;
  const gap = hi - lo - 1;
  if (gap === 0) s += 0.05;
  else if (gap === 1) s += 0.03;
  else if (gap >= 4) s -= 0.04;
  return Math.min(1, Math.max(0, s));
}

function drawBonus(cards: readonly Card[]): number {
  const suits = new Map<string, number>();
  for (const c of cards) suits.set(c.suit, (suits.get(c.suit) ?? 0) + 1);
  let bonus = Math.max(0, ...suits.values()) === 4 ? 0.14 : 0;
  const ranks = new Set<number>();
  for (const c of cards) {
    ranks.add(c.rank);
    if (c.rank === 14) ranks.add(1);
  }
  for (let low = 1; low <= 11; low++) {
    let count = 0;
    for (let r = low; r < low + 5; r++) if (ranks.has(r)) count++;
    if (count === 4) {
      bonus += 0.08;
      break;
    }
  }
  return bonus;
}

/**
 * 내 패 강도 근사치 (0~1). 내 홀카드와 공개된 보드만 쓴다.
 * 몬테카를로 없이 족보·드로우·보드 의존도·상대 수로 가볍게 계산한다.
 */
export function estimateHoldemStrength(view: HoldemView): number {
  const me = view.players.find((p) => p.id === view.myId);
  if (!me) return 0;
  const hole = me.hole.filter((c): c is Card => c !== null);
  const opponents = view.players.filter((p) => p.id !== me.id && !p.folded).length;

  let strength: number;
  if (view.board.length === 0) {
    strength = preflopStrength(hole);
  } else {
    const mine = evaluateHand([...hole, ...view.board]);
    strength = MADE_STRENGTH[mine.category] + (((mine.values[0] ?? 2) - 2) / 12) * 0.06;
    // 보드만으로 같은 족보면 내 홀카드가 보탬이 안 된다
    const boardOnly = evaluateHand(view.board);
    if (boardOnly.category === mine.category && mine.category <= HandCategory.TwoPair) {
      strength = Math.min(strength, 0.2 + ((Math.max(...hole.map((c) => c.rank)) - 2) / 12) * 0.1);
    }
    if (view.board.length < 5 && mine.category < HandCategory.Straight) {
      strength += drawBonus([...hole, ...view.board]);
    }
  }
  strength -= Math.max(0, opponents - 1) * 0.03;
  return Math.min(1, Math.max(0, strength));
}

/** 내가 이번 거리에서 마지막 쪽에 액션하는지 (버튼에 가까울수록 유리) */
function isLatePosition(view: HoldemView): boolean {
  const ids = view.players.map((p) => p.id);
  const n = ids.length;
  const button = ids.indexOf(view.buttonId);
  const me = ids.indexOf(view.myId ?? '');
  const distance = (button - me + n) % n; // 0이면 버튼
  return distance <= 1;
}

const clampTo = (a: HoldemLegalAction, to: number) => Math.min(a.max!, Math.max(a.min!, Math.round(to)));

/**
 * 홀덤 봇의 액션 결정. view.legalActions 안에서만 고른다.
 * 입력은 봇 자신의 시야뿐이라 상대 홀카드, 번 카드, 덱을 볼 수 없다.
 */
export function decideHoldemAction(
  view: HoldemView,
  random: BotRandom = Math.random,
  config: BotConfig = BOT_CONFIG,
): HoldemAction {
  const legal = view.legalActions;
  if (legal.length === 0) throw new Error('봇이 할 수 있는 액션이 없습니다');
  const has = (type: HoldemLegalAction['type']) => legal.find((a) => a.type === type);
  const check = has('check');
  const call = has('call');
  const bet = has('bet');
  const raise = has('raise');
  const me = view.players.find((p) => p.id === view.myId)!;

  const strength = estimateHoldemStrength(view);
  const toCall = call?.amount ?? 0;
  const potOdds = toCall > 0 ? toCall / (view.pot + toCall) : 0;
  const late = isLatePosition(view);

  const aggressive = (size: number): HoldemAction | null => {
    if (bet) return { type: 'bet', amount: clampTo(bet, view.pot * size) };
    if (raise) return { type: 'raise', amount: clampTo(raise, view.currentBet + (view.pot + toCall) * size) };
    return null;
  };
  const passive = (): HoldemAction => (check ? { type: 'check' } : { type: 'call' });
  const fold = (): HoldemAction => (check ? { type: 'check' } : { type: 'fold' });

  let choice: HoldemAction;
  if (strength >= 0.82) {
    choice = (random() < config.aggression ? aggressive(0.75) : null) ?? (call || check ? passive() : fold());
  } else if (strength >= 0.6) {
    const wantRaise = random() < config.aggression * (toCall === 0 ? 1 : 0.4);
    choice = (wantRaise ? aggressive(0.5) : null) ?? (toCall === 0 || strength >= potOdds + config.callMargin ? passive() : fold());
  } else if (toCall === 0) {
    const bluff = random() < config.bluffRate * (late ? 1.6 : 1);
    choice = (bluff ? aggressive(0.5) : null) ?? { type: 'check' };
  } else if (strength >= potOdds + config.callMargin) {
    // 칩을 모두 걸어야 하는 콜은 더 신중하게
    choice = call?.allIn && strength < 0.55 ? fold() : passive();
  } else {
    choice = fold();
  }

  // 가벼운 실수: 차선의 선택 (공짜로 볼 수 있을 때 폴드하는 실수는 하지 않음)
  if (random() < config.mistakeRate) {
    if (choice.type === 'fold' && call && toCall <= view.pot * 0.3) choice = { type: 'call' };
    else if (choice.type === 'call') choice = (random() < 0.5 ? aggressive(0.5) : null) ?? fold();
    else if (choice.type === 'bet' || choice.type === 'raise') choice = passive();
    else if (choice.type === 'check') choice = aggressive(0.33) ?? choice;
  }

  // 남은 칩이 아주 적으면 올인으로 정리
  if ((choice.type === 'bet' || choice.type === 'raise') && choice.amount! >= me.roundBet + me.stack) {
    choice = has('allin') ? { type: 'allin' } : choice;
  }
  return choice;
}
