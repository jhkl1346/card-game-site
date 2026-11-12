import { randomInt } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createDeck,
  evaluateHand,
  HandCategory,
  scoreHand,
  shuffle,
  type Card,
} from '../src/index.js';

/** 52장에서 5장을 고르는 모든 조합의 표준 족보별 개수 */
const EXPECTED: Readonly<Record<HandCategory, number>> = {
  [HandCategory.RoyalFlush]: 4,
  [HandCategory.StraightFlush]: 36,
  [HandCategory.Quads]: 624,
  [HandCategory.FullHouse]: 3_744,
  [HandCategory.Flush]: 5_108,
  [HandCategory.Straight]: 10_200,
  [HandCategory.Trips]: 54_912,
  [HandCategory.TwoPair]: 123_552,
  [HandCategory.OnePair]: 1_098_240,
  [HandCategory.HighCard]: 1_302_540,
};

describe('족보 판정 전수 테스트', () => {
  it('5장 조합 2,598,960가지의 족보별 개수가 표준 값과 정확히 일치한다', () => {
    const deck = createDeck();
    const counts = new Array<number>(10).fill(0);
    // 같은 배열을 재사용해 객체 생성을 줄인다 (CI 실행 시간 절약)
    const hand: Card[] = new Array<Card>(5);
    let total = 0;
    for (let a = 0; a < 48; a++) {
      hand[0] = deck[a] as Card;
      for (let b = a + 1; b < 49; b++) {
        hand[1] = deck[b] as Card;
        for (let c = b + 1; c < 50; c++) {
          hand[2] = deck[c] as Card;
          for (let d = c + 1; d < 51; d++) {
            hand[3] = deck[d] as Card;
            for (let e = d + 1; e < 52; e++) {
              hand[4] = deck[e] as Card;
              const { category } = scoreHand(hand);
              counts[category] = (counts[category] as number) + 1;
              total++;
            }
          }
        }
      }
    }
    expect(total).toBe(2_598_960);
    const actual = Object.fromEntries(counts.map((n, category) => [category, n]));
    expect(actual).toEqual(Object.fromEntries(Object.entries(EXPECTED)));
  });

  it('7장 판정은 21가지 5장 조합 중 최고와 항상 같다 (무작위 2만 개 표본)', () => {
    const deck = createDeck();
    for (let t = 0; t < 20_000; t++) {
      const seven = shuffle(deck, randomInt).slice(0, 7);
      let bestScore = -1;
      for (let skip1 = 0; skip1 < 7; skip1++) {
        for (let skip2 = skip1 + 1; skip2 < 7; skip2++) {
          const five = seven.filter((_, i) => i !== skip1 && i !== skip2);
          bestScore = Math.max(bestScore, scoreHand(five).score);
        }
      }
      const result = evaluateHand(seven);
      expect(result.score).toBe(bestScore);
      // 고른 5장만으로 다시 판정해도 같은 점수여야 한다
      expect(scoreHand(result.cards).score).toBe(result.score);
    }
  });
});
