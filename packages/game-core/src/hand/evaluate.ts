import { cardIndex, type Card, type Suit } from '../cards/card.js';

/** 족보 종류 (숫자가 클수록 높은 족보) */
export enum HandCategory {
  HighCard = 0,
  OnePair = 1,
  TwoPair = 2,
  Trips = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  Quads = 7,
  StraightFlush = 8,
  RoyalFlush = 9,
}

export const HAND_CATEGORY_NAMES_KO: Readonly<Record<HandCategory, string>> = {
  [HandCategory.HighCard]: '하이카드',
  [HandCategory.OnePair]: '원페어',
  [HandCategory.TwoPair]: '투페어',
  [HandCategory.Trips]: '트리플',
  [HandCategory.Straight]: '스트레이트',
  [HandCategory.Flush]: '플러시',
  [HandCategory.FullHouse]: '풀하우스',
  [HandCategory.Quads]: '포카드',
  [HandCategory.StraightFlush]: '스트레이트 플러시',
  [HandCategory.RoyalFlush]: '로열 스트레이트 플러시',
};

export interface HandRank {
  category: HandCategory;
  /** 한국어 족보 이름 */
  name: string;
  /**
   * 같은 족보끼리 비교하는 숫자 목록 (앞쪽이 우선).
   * 예) 풀하우스 [트리플 숫자, 페어 숫자], 투페어 [높은 페어, 낮은 페어, 키커],
   *     스트레이트 [가장 높은 카드] (A-2-3-4-5는 5)
   */
  values: number[];
  /** 한 번의 숫자 비교로 우열을 가리는 점수. 클수록 강하다. 무늬는 반영하지 않는다. */
  score: number;
  /** 족보를 이루는 카드 (최대 5장, 족보 카드 → 키커 순) */
  cards: Card[];
}

const SUIT_INDEX: Readonly<Record<Suit, number>> = { S: 0, H: 1, D: 2, C: 3 };
const INDEX_SUIT: readonly Suit[] = ['S', 'H', 'D', 'C'];
const ACE_BIT = 1 << 14;
const BASE = 15;
const CATEGORY_WEIGHT = BASE ** 5;

interface Analysis {
  category: HandCategory;
  values: number[];
  /** 플러시 계열일 때 무늬 번호, 아니면 -1 */
  flushSuit: number;
}

/** 가장 높은 스트레이트의 꼭대기 숫자. 없으면 0. A는 1로도 쓰인다(A-2-3-4-5 → 5). */
function straightHigh(rankMask: number): number {
  const mask = rankMask & ACE_BIT ? rankMask | (1 << 1) : rankMask;
  for (let high = 14; high >= 5; high--) {
    const need = 0b11111 << (high - 4);
    if ((mask & need) === need) return high;
  }
  return 0;
}

function analyze(cards: readonly Card[]): Analysis {
  const counts = new Array<number>(15).fill(0);
  const suitCounts = [0, 0, 0, 0];
  const suitMasks = [0, 0, 0, 0];
  let rankMask = 0;

  for (const card of cards) {
    const s = SUIT_INDEX[card.suit];
    counts[card.rank] = (counts[card.rank] as number) + 1;
    suitCounts[s] = (suitCounts[s] as number) + 1;
    suitMasks[s] = (suitMasks[s] as number) | (1 << card.rank);
    rankMask |= 1 << card.rank;
  }

  let flushSuit = -1;
  for (let s = 0; s < 4; s++) {
    if ((suitCounts[s] as number) >= 5) flushSuit = s; // 7장 이하에서는 플러시 무늬가 하나뿐
  }

  // 스트레이트 플러시 / 로열 스트레이트 플러시
  if (flushSuit >= 0) {
    const sfHigh = straightHigh(suitMasks[flushSuit] as number);
    if (sfHigh > 0) {
      return {
        category: sfHigh === 14 ? HandCategory.RoyalFlush : HandCategory.StraightFlush,
        values: [sfHigh],
        flushSuit,
      };
    }
  }

  const quads: number[] = [];
  const trips: number[] = [];
  const pairs: number[] = [];
  for (let r = 14; r >= 2; r--) {
    const c = counts[r] as number;
    if (c === 4) quads.push(r);
    else if (c === 3) trips.push(r);
    else if (c === 2) pairs.push(r);
  }

  /** 제외할 숫자를 뺀 나머지에서 높은 숫자부터 n개 (키커) */
  const kickers = (exclude: readonly number[], n: number): number[] => {
    const out: number[] = [];
    for (let r = 14; r >= 2 && out.length < n; r--) {
      if ((counts[r] as number) > 0 && !exclude.includes(r)) out.push(r);
    }
    return out;
  };

  const top = quads[0];
  if (top !== undefined) {
    return { category: HandCategory.Quads, values: [top, ...kickers([top], 1)], flushSuit: -1 };
  }

  const topTrip = trips[0];
  if (topTrip !== undefined) {
    // 트리플이 둘이면 낮은 쪽을 페어로 쓴다. 페어 후보 중 가장 높은 것을 고른다.
    const pairForFull = Math.max(trips[1] ?? 0, pairs[0] ?? 0);
    if (pairForFull > 0) {
      return { category: HandCategory.FullHouse, values: [topTrip, pairForFull], flushSuit: -1 };
    }
  }

  if (flushSuit >= 0) {
    const mask = suitMasks[flushSuit] as number;
    const values: number[] = [];
    for (let r = 14; r >= 2 && values.length < 5; r--) {
      if (mask & (1 << r)) values.push(r);
    }
    return { category: HandCategory.Flush, values, flushSuit };
  }

  const high = straightHigh(rankMask);
  if (high > 0) {
    return { category: HandCategory.Straight, values: [high], flushSuit: -1 };
  }

  if (topTrip !== undefined) {
    return { category: HandCategory.Trips, values: [topTrip, ...kickers([topTrip], 2)], flushSuit: -1 };
  }

  const p1 = pairs[0];
  const p2 = pairs[1];
  if (p1 !== undefined && p2 !== undefined) {
    // 페어가 3개면 높은 2개만 쓰고, 세 번째 페어 숫자도 키커 후보가 된다.
    return { category: HandCategory.TwoPair, values: [p1, p2, ...kickers([p1, p2], 1)], flushSuit: -1 };
  }

  if (p1 !== undefined) {
    return { category: HandCategory.OnePair, values: [p1, ...kickers([p1], 3)], flushSuit: -1 };
  }

  return { category: HandCategory.HighCard, values: kickers([], 5), flushSuit: -1 };
}

function toScore(category: HandCategory, values: readonly number[]): number {
  let score = category * CATEGORY_WEIGHT;
  let weight = CATEGORY_WEIGHT / BASE;
  for (let i = 0; i < 5; i++) {
    score += (values[i] ?? 0) * weight;
    weight /= BASE;
  }
  return score;
}

function validate(cards: readonly Card[]): void {
  if (cards.length < 1 || cards.length > 7) {
    throw new Error(`족보 판정은 1~7장만 가능합니다: ${cards.length}장`);
  }
  let seen = 0n;
  for (const card of cards) {
    const bit = 1n << BigInt(cardIndex(card));
    if (seen & bit) throw new Error('같은 카드가 두 번 들어 있습니다');
    seen |= bit;
  }
}

/** 족보 카드 → 키커 순서로 실제 카드를 고른다. */
function pickCards(cards: readonly Card[], analysis: Analysis): Card[] {
  const used = new Array<boolean>(cards.length).fill(false);
  const take = (rank: number, suit: number): Card | undefined => {
    const wantRank = rank === 1 ? 14 : rank;
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i] as Card;
      if (used[i] || card.rank !== wantRank) continue;
      if (suit >= 0 && card.suit !== INDEX_SUIT[suit]) continue;
      used[i] = true;
      return card;
    }
    return undefined;
  };

  const plan: Array<[rank: number, times: number]> = [];
  const { category, values, flushSuit } = analysis;
  const v = (i: number) => values[i] as number;
  switch (category) {
    case HandCategory.RoyalFlush:
    case HandCategory.StraightFlush:
    case HandCategory.Straight:
      for (let r = v(0); r > v(0) - 5; r--) plan.push([r, 1]);
      break;
    case HandCategory.Quads:
      plan.push([v(0), 4], ...values.slice(1).map((r): [number, number] => [r, 1]));
      break;
    case HandCategory.FullHouse:
      plan.push([v(0), 3], [v(1), 2]);
      break;
    case HandCategory.Trips:
      plan.push([v(0), 3], ...values.slice(1).map((r): [number, number] => [r, 1]));
      break;
    case HandCategory.TwoPair:
      plan.push([v(0), 2], [v(1), 2], ...values.slice(2).map((r): [number, number] => [r, 1]));
      break;
    case HandCategory.OnePair:
      plan.push([v(0), 2], ...values.slice(1).map((r): [number, number] => [r, 1]));
      break;
    case HandCategory.Flush:
    case HandCategory.HighCard:
      plan.push(...values.map((r): [number, number] => [r, 1]));
      break;
  }

  const picked: Card[] = [];
  for (const [rank, times] of plan) {
    for (let t = 0; t < times; t++) {
      const card = take(rank, flushSuit);
      if (!card) throw new Error('족보 카드 선택 중 내부 오류가 발생했습니다');
      picked.push(card);
    }
  }
  return picked;
}

/**
 * 주어진 카드(1~7장)로 만들 수 있는 가장 높은 족보를 돌려준다. 순수 함수.
 * - 5장 이상이면 그중 최고 5장 조합을 자동으로 고른다.
 * - 5장 미만(7포커 오픈 카드 비교 등)이면 스트레이트·플러시 없이 있는 카드로만 판정한다.
 * - 무늬는 우열에 반영하지 않는다. 무늬로 승부를 가르는 규칙은 각 게임 규칙(Stud7Rules)에서 따로 처리한다.
 */
export function evaluateHand(cards: readonly Card[]): HandRank {
  validate(cards);
  const analysis = analyze(cards);
  return {
    category: analysis.category,
    name: HAND_CATEGORY_NAMES_KO[analysis.category],
    values: analysis.values,
    score: toScore(analysis.category, analysis.values),
    cards: pickCards(cards, analysis),
  };
}

/**
 * 점수만 빠르게 계산한다. (카드 선택·중복 검사 생략)
 * 전수 테스트, 봇의 대량 계산처럼 속도가 중요한 곳에서 쓴다. 입력이 올바르다고 가정한다.
 */
export function scoreHand(cards: readonly Card[]): { category: HandCategory; score: number } {
  const analysis = analyze(cards);
  return { category: analysis.category, score: toScore(analysis.category, analysis.values) };
}

/** a가 강하면 양수, b가 강하면 음수, 같으면 0 */
export function compareHands(a: HandRank, b: HandRank): number {
  return Math.sign(a.score - b.score);
}

/** 가장 높은 족보를 가진 사람들의 인덱스. 여러 명이면 무승부(팟 분할). */
export function findWinners(hands: readonly HandRank[]): number[] {
  let best = -Infinity;
  let winners: number[] = [];
  hands.forEach((hand, i) => {
    if (hand.score > best) {
      best = hand.score;
      winners = [i];
    } else if (hand.score === best) {
      winners.push(i);
    }
  });
  return winners;
}

/** 숫자를 화면용 글자로 (스트레이트 꼭대기 등) */
export function rankValueLabel(value: number): string {
  const labels: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 1: 'A' };
  return labels[value] ?? String(value);
}
