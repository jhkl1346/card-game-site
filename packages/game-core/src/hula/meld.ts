import { cardToString, parseCard, RANKS, SUITS, type Card } from '../cards/card.js';
import type { HulaRules } from './rules.js';

/** 조커 카드 (1번·2번) */
export interface JokerCard {
  readonly joker: 1 | 2;
}

/** 훌라에서 쓰는 카드: 일반 카드 또는 조커 */
export type HulaCard = Card | JokerCard;

export const isJoker = (card: HulaCard): card is JokerCard => 'joker' in card;

/** 카드 식별 문자열: 일반 카드는 "As", 조커는 "JK1"/"JK2" */
export function hulaCardId(card: HulaCard): string {
  return isJoker(card) ? `JK${card.joker}` : cardToString(card);
}

export function parseHulaCard(id: string): HulaCard {
  if (id === 'JK1' || id === 'JK2') return { joker: id === 'JK1' ? 1 : 2 };
  return parseCard(id);
}

/** 52장 + 조커 */
export function createHulaDeck(jokers: 0 | 1 | 2): HulaCard[] {
  const deck: HulaCard[] = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ rank, suit });
  for (let j = 1; j <= jokers; j++) deck.push({ joker: j as 1 | 2 });
  return deck;
}

/** 손에 남았을 때의 점수 */
export function hulaCardPoints(card: HulaCard, rules: Pick<HulaRules, 'jokerPoints' | 'faceCardPoints'>): number {
  if (isJoker(card)) return rules.jokerPoints;
  if (card.rank === 14) return 1;
  if (card.rank >= 11) return rules.faceCardPoints === 'ten' ? 10 : card.rank;
  return card.rank;
}

export function handPoints(cards: readonly HulaCard[], rules: Pick<HulaRules, 'jokerPoints' | 'faceCardPoints'>): number {
  return cards.reduce((sum, c) => sum + hulaCardPoints(c, rules), 0);
}

export type MeldKind = 'set' | 'run' | 'seven';

function isSet(naturals: readonly Card[], total: number): boolean {
  const rank = naturals[0]!.rank;
  if (!naturals.every((c) => c.rank === rank)) return false;
  if (new Set(naturals.map((c) => c.suit)).size !== naturals.length) return false;
  return total <= 4;
}

function isRun(naturals: readonly Card[], total: number, rules: Pick<HulaRules, 'aceHighInRun'>): boolean {
  const suit = naturals[0]!.suit;
  if (!naturals.every((c) => c.suit === suit)) return false;
  if (total > 13) return false;
  const jokers = total - naturals.length;
  const variants: Array<(r: number) => number> = [(r) => (r === 14 ? 1 : r)]; // A를 낮게
  if (rules.aceHighInRun) variants.push((r) => r); // A를 높게
  return variants.some((map) => {
    const ranks = naturals.map((c) => map(c.rank)).sort((a, b) => a - b);
    if (new Set(ranks).size !== ranks.length) return false;
    const span = ranks[ranks.length - 1]! - ranks[0]! + 1;
    return span - ranks.length <= jokers;
  });
}

/**
 * 카드 묶음이 어떤 멜드인지 판정한다. 아니면 null.
 * - isNew=true(새로 등록): 3장 이상, 또는 sevenAlone이면 7 한 장
 * - isNew=false(붙여놓기 후 전체): 장수 제한 없이 세트/런 구조만 확인 (7 단독 멜드에 붙이는 경우 2장도 허용)
 * - 조커는 아무 카드나 대신하며, 일반 카드가 최소 1장은 있어야 한다.
 */
export function classifyMeld(
  cards: readonly HulaCard[],
  rules: Pick<HulaRules, 'aceHighInRun' | 'sevenAlone'>,
  isNew: boolean,
): MeldKind | null {
  const naturals = cards.filter((c): c is Card => !isJoker(c));
  if (naturals.length === 0) return null;
  if (isNew && cards.length === 1) {
    return rules.sevenAlone && naturals[0]!.rank === 7 ? 'seven' : null;
  }
  if (isNew && cards.length < 3) return null;
  if (isSet(naturals, cards.length)) return 'set';
  if (isRun(naturals, cards.length, rules)) return 'run';
  return null;
}

/** 손패에서 새로 등록할 수 있는 모든 멜드 (카드 인덱스 묶음). 손패는 최대 8장이라 부분집합을 모두 확인해도 가볍다. */
export function findMelds(
  hand: readonly HulaCard[],
  rules: Pick<HulaRules, 'aceHighInRun' | 'sevenAlone'>,
): number[][] {
  const result: number[][] = [];
  const n = hand.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    const indices: number[] = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) indices.push(i);
    if (indices.length === 2) continue;
    if (classifyMeld(indices.map((i) => hand[i]!), rules, true)) result.push(indices);
  }
  return result;
}
