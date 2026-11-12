import type { Card } from '../cards/card.js';
import { evaluateHand, HandCategory } from '../hand/evaluate.js';
import type { Stud7Action, Stud7LegalAction, Stud7View } from '../stud7/engine.js';
import type { Stud7ActionType } from '../stud7/rules.js';
import { BOT_CONFIG, type BotConfig, type BotRandom } from './config.js';

/** 족보 종류별 기본 강도 (0~1) */
const CATEGORY_STRENGTH: Readonly<Record<HandCategory, number>> = {
  [HandCategory.HighCard]: 0.08,
  [HandCategory.OnePair]: 0.32,
  [HandCategory.TwoPair]: 0.56,
  [HandCategory.Trips]: 0.7,
  [HandCategory.Straight]: 0.8,
  [HandCategory.Flush]: 0.85,
  [HandCategory.FullHouse]: 0.92,
  [HandCategory.Quads]: 0.97,
  [HandCategory.StraightFlush]: 0.99,
  [HandCategory.RoyalFlush]: 1,
};

/** 4장이 이어지는 스트레이트 드로우가 있는지 (A는 1로도 셈) */
function hasStraightDraw(cards: readonly Card[]): boolean {
  const ranks = new Set<number>();
  for (const c of cards) {
    ranks.add(c.rank);
    if (c.rank === 14) ranks.add(1);
  }
  for (let low = 1; low <= 11; low++) {
    let count = 0;
    for (let r = low; r < low + 5; r++) if (ranks.has(r)) count++;
    if (count >= 4) return true;
  }
  return false;
}

function maxSuitCount(cards: readonly Card[]): number {
  const counts = new Map<string, number>();
  for (const c of cards) counts.set(c.suit, (counts.get(c.suit) ?? 0) + 1);
  return Math.max(0, ...counts.values());
}

/**
 * 내 패 강도 근사치 (0~1). 몬테카를로 없이 가볍게 계산한다.
 * - 내가 볼 수 있는 카드(내 카드 전부 + 상대 공개 카드)만 쓴다.
 */
export function estimateStud7Strength(view: Stud7View): number {
  const me = view.players.find((p) => p.id === view.myId);
  if (!me) return 0;
  const myCards = me.cards.filter((c): c is Card => c !== null);
  const hand = evaluateHand(myCards);
  const lead = hand.values[0] ?? 2;
  let strength = CATEGORY_STRENGTH[hand.category] + ((lead - 2) / 12) * 0.08;

  const cardsToCome = 7 - myCards.length;
  if (cardsToCome > 0) {
    const suited = maxSuitCount(myCards);
    if (hand.category < HandCategory.Flush && suited === 4) strength += 0.14;
    else if (hand.category < HandCategory.Flush && suited === 3 && myCards.length <= 4) strength += 0.05;
    if (hand.category < HandCategory.Straight && hasStraightDraw(myCards)) strength += 0.08;
    // 아직 받을 카드가 많을수록 낮은 패도 가능성이 남아 있다
    strength += cardsToCome * 0.015;
  }

  // 상대 공개 카드가 이미 내 패 이상이면 위험
  let threats = 0;
  for (const p of view.players) {
    if (p.id === me.id || p.folded) continue;
    const open = p.cards.filter((c): c is Card => c !== null);
    if (open.length === 0) continue;
    const theirs = evaluateHand(open);
    if (theirs.score >= hand.score) threats++;
    else if (theirs.category >= HandCategory.OnePair && theirs.category >= hand.category) threats += 0.5;
  }
  strength -= Math.min(threats * 0.1, 0.25);

  return Math.min(1, Math.max(0, strength));
}

function pick(legal: readonly Stud7LegalAction[], preferences: readonly Stud7ActionType[]): Stud7ActionType | null {
  for (const type of preferences) if (legal.some((a) => a.type === type)) return type;
  return null;
}

/**
 * 처음 3장 중 공개할 카드 고르기. 사람처럼 좋은 카드는 숨긴다.
 * - 페어가 있으면 짝이 아닌 카드를 공개 (페어를 숨김)
 * - 트리플이면 아무거나 (어차피 숨겨진 2장이 같음)
 * - 그 외에는 가장 낮은 카드를 공개하고, 가끔은 높은 카드를 보여 강한 척한다
 */
export function chooseStud7OpenCard(cards: readonly Card[], random: BotRandom = Math.random, config: BotConfig = BOT_CONFIG): number {
  if (random() < config.mistakeRate) return Math.floor(random() * 3);
  const ranks = cards.map((c) => c.rank);
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const pairRank = [...counts].find(([, n]) => n === 2)?.[0];
  if (pairRank !== undefined) return ranks.findIndex((r) => r !== pairRank);
  const order = [0, 1, 2].sort((a, b) => ranks[a]! - ranks[b]!);
  return random() < config.bluffRate * 1.5 ? order[2]! : order[0]!;
}

/**
 * 7포커 봇의 액션 결정. 반드시 getLegalActions 결과(view.legalActions) 안에서만 고른다.
 * 입력은 봇 자신의 시야(view)뿐이므로 상대 비공개 카드나 덱을 볼 방법이 없다.
 */
export function decideStud7Action(
  view: Stud7View,
  random: BotRandom = Math.random,
  config: BotConfig = BOT_CONFIG,
): Stud7Action {
  const legal = view.legalActions;
  if (legal.length === 0) throw new Error('봇이 할 수 있는 액션이 없습니다');
  const me = view.players.find((p) => p.id === view.myId)!;

  if (view.phase === 'choose') {
    const mine = me.cards.filter((c): c is Card => c !== null);
    return { type: 'open', cardIndex: chooseStud7OpenCard(mine, random, config) };
  }

  const strength = estimateStud7Strength(view);
  const call = legal.find((a) => a.type === 'call');
  const toCall = call?.amount ?? 0;
  const potOdds = toCall > 0 ? toCall / (view.pot + toCall) : 0;
  const isLastStreet = view.street === 7;
  const othersAlive = view.players.filter((p) => !p.folded && p.id !== me.id).length;

  let preferences: Stud7ActionType[];
  if (strength >= 0.85) {
    preferences = random() < config.aggression ? ['full', 'half', 'ddadang', 'quarter', 'bbing', 'call', 'check'] : ['half', 'quarter', 'ddadang', 'bbing', 'call', 'check'];
  } else if (strength >= 0.62) {
    const raises: Stud7ActionType[] = random() < 0.5 ? ['quarter', 'ddadang', 'half'] : ['half', 'quarter', 'ddadang'];
    preferences = random() < config.aggression ? [...raises, 'bbing', 'call', 'check'] : ['call', 'bbing', 'check'];
  } else if (toCall === 0) {
    // 아무도 베팅하지 않았을 때: 가끔 블러프 (마지막 장이고 상대가 적으면 조금 더)
    const bluffRate = config.bluffRate * (isLastStreet && othersAlive <= 2 ? 1.5 : 1);
    if (random() < bluffRate) preferences = ['half', 'quarter', 'bbing', 'check'];
    else preferences = strength >= 0.4 ? ['bbing', 'check'] : ['check'];
  } else if (strength >= potOdds + config.callMargin) {
    // 남은 칩을 모두 걸어야 하는 콜은 더 신중하게
    preferences = call!.allIn && strength < 0.5 ? ['die'] : ['call'];
  } else {
    preferences = ['die'];
  }

  let choice = pick(legal, preferences) ?? pick(legal, ['check', 'call', 'die'])!;

  // 가벼운 실수: 차선의 선택. 단, 공짜로 볼 수 있는데 다이하는 실수는 하지 않는다.
  if (random() < config.mistakeRate) {
    const alternatives: Stud7ActionType[] =
      choice === 'die'
        ? toCall <= view.pot * 0.25 ? ['call'] : []
        : choice === 'call'
          ? ['ddadang', 'quarter', 'die']
          : choice === 'check'
            ? ['bbing']
            : ['call', 'check'];
    const mistake = pick(legal, alternatives);
    if (mistake) choice = mistake;
  }
  return { type: choice };
}
