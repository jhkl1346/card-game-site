import { randomInt } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  cardIndex,
  cardToString,
  createDeck,
  draw,
  parseCard,
  parseCards,
  shuffle,
} from '../src/index.js';

describe('카드 표기', () => {
  it('문자열과 카드를 서로 바꿀 수 있다', () => {
    expect(parseCard('As')).toEqual({ rank: 14, suit: 'S' });
    expect(parseCard('10h')).toEqual({ rank: 10, suit: 'H' });
    expect(parseCard('Td')).toEqual({ rank: 10, suit: 'D' });
    expect(cardToString({ rank: 2, suit: 'C' })).toBe('2c');
    expect(parseCards('Ks Qh  7c').map(cardToString)).toEqual(['Ks', 'Qh', '7c']);
  });

  it('잘못된 표기는 예외를 던진다', () => {
    for (const bad of ['1s', 'Ax', '', 'AAs', '11c']) {
      expect(() => parseCard(bad)).toThrow();
    }
  });
});

describe('덱', () => {
  it('52장이 모두 다르다', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map(cardIndex)).size).toBe(52);
  });

  it('draw는 위에서부터 뽑고, 모자라면 예외를 던진다', () => {
    const deck = createDeck();
    const { drawn, rest } = draw(deck, 3);
    expect(drawn).toEqual(deck.slice(0, 3));
    expect(rest).toHaveLength(49);
    expect(() => draw(rest, 50)).toThrow('부족');
  });
});

describe('셔플 (Fisher-Yates + crypto.randomInt)', () => {
  it('원본을 바꾸지 않고, 같은 카드 52장을 돌려준다', () => {
    const deck = createDeck();
    const before = deck.map(cardToString);
    const shuffled = shuffle(deck, randomInt);
    expect(deck.map(cardToString)).toEqual(before);
    expect(shuffled.map(cardToString).sort()).toEqual([...before].sort());
  });

  it('범위를 벗어난 난수 함수는 거부한다', () => {
    expect(() => shuffle([1, 2, 3], (max) => max)).toThrow('범위');
  });

  it('3장의 6가지 순열이 고르게 나온다 (편향 없음)', () => {
    const trials = 60_000;
    const counts = new Map<string, number>();
    for (let t = 0; t < trials; t++) {
      const key = shuffle(['a', 'b', 'c'], randomInt).join('');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.size).toBe(6);
    for (const count of counts.values()) {
      // 기대값 10,000. 표준편차 약 91이므로 ±600은 사실상 실패하지 않는 범위
      expect(Math.abs(count - trials / 6)).toBeLessThan(600);
    }
  });
});
