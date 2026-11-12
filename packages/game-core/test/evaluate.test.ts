import { describe, expect, it } from 'vitest';
import {
  cardToString,
  compareHands,
  evaluateHand,
  findWinners,
  HandCategory,
  parseCards,
} from '../src/index.js';

const h = (text: string) => evaluateHand(parseCards(text));
const best = (text: string) => h(text).cards.map(cardToString);
/** a가 b보다 강한지 (양쪽 순서 모두 확인) */
const expectStronger = (a: string, b: string) => {
  expect(compareHands(h(a), h(b))).toBe(1);
  expect(compareHands(h(b), h(a))).toBe(-1);
};
const expectTie = (a: string, b: string) => expect(compareHands(h(a), h(b))).toBe(0);

describe('족보 종류별 판정 (5장)', () => {
  const cases: Array<[string, HandCategory, string]> = [
    ['As Ks Qs Js Ts', HandCategory.RoyalFlush, '로열 스트레이트 플러시'],
    ['9h 8h 7h 6h 5h', HandCategory.StraightFlush, '스트레이트 플러시'],
    ['7c 7d 7h 7s 2d', HandCategory.Quads, '포카드'],
    ['Kc Kd Kh 4s 4d', HandCategory.FullHouse, '풀하우스'],
    ['Ad 9d 7d 4d 2d', HandCategory.Flush, '플러시'],
    ['9c 8d 7h 6s 5d', HandCategory.Straight, '스트레이트'],
    ['Qc Qd Qh 8s 3d', HandCategory.Trips, '트리플'],
    ['Jc Jd 4h 4s 9d', HandCategory.TwoPair, '투페어'],
    ['Tc Td 8h 5s 2d', HandCategory.OnePair, '원페어'],
    ['Ac Jd 8h 5s 2d', HandCategory.HighCard, '하이카드'],
  ];
  it.each(cases)('%s → %s', (text, category, name) => {
    const rank = h(text);
    expect(rank.category).toBe(category);
    expect(rank.name).toBe(name);
    expect(rank.cards).toHaveLength(5);
  });

  it('족보 순위가 높은 순서대로 강하다', () => {
    const texts = cases.map(([text]) => text);
    for (let i = 0; i < texts.length - 1; i++) {
      expectStronger(texts[i] as string, texts[i + 1] as string);
    }
  });
});

describe('A의 위치와 스트레이트', () => {
  it('A-2-3-4-5는 5가 가장 높은 스트레이트다', () => {
    const rank = h('Ac 2d 3h 4s 5d');
    expect(rank.category).toBe(HandCategory.Straight);
    expect(rank.values).toEqual([5]);
    expect(best('Ac 2d 3h 4s 5d')).toEqual(['5d', '4s', '3h', '2d', 'Ac']);
  });

  it('A-K-Q-J-10이 가장 높은 스트레이트이고, 6-high는 A-5보다 강하다', () => {
    expectStronger('Ac Kd Qh Js Td', 'Kc Qd Jh Ts 9d');
    expectStronger('2c 3d 4h 5s 6d', 'Ac 2d 3h 4s 5d');
  });

  it('K-A-2-3-4처럼 A를 넘어가는 것은 스트레이트가 아니다', () => {
    expect(h('Kc Ad 2h 3s 4d').category).toBe(HandCategory.HighCard);
    expect(h('Qc Kd Ah 2s 3d').category).toBe(HandCategory.HighCard);
  });

  it('A-2-3-4-5 스트레이트 플러시(스틸 휠)', () => {
    const rank = h('As 2s 3s 4s 5s');
    expect(rank.category).toBe(HandCategory.StraightFlush);
    expect(rank.values).toEqual([5]);
    expectStronger('6s 2s 3s 4s 5s', 'As 2s 3s 4s 5s');
  });

  it('A는 하이카드 비교에서 가장 높다', () => {
    expectStronger('Ac 3d 5h 7s 9d', 'Kc Qd Jh 9s 7d');
  });
});

describe('7장에서 최고 5장 고르기', () => {
  it('플러시와 스트레이트가 같이 있으면 플러시를 고른다', () => {
    const rank = h('2h 5h 9h Jh Kh Tc Qd');
    expect(rank.category).toBe(HandCategory.Flush);
    expect(best('2h 5h 9h Jh Kh Tc Qd')).toEqual(['Kh', 'Jh', '9h', '5h', '2h']);
  });

  it('플러시와 스트레이트가 겹쳐 스트레이트 플러시가 되면 그것을 고른다', () => {
    const rank = h('5d 6d 7d 8d 9d Td 2c');
    expect(rank.category).toBe(HandCategory.StraightFlush);
    expect(rank.values).toEqual([10]);
  });

  it('같은 무늬 6장 중 스트레이트가 일부 무늬로만 되면 스트레이트 플러시가 아니다', () => {
    // 하트: 2,4,5,6,9,K / 스트레이트 2-3-4-5-6 은 3이 클로버
    const rank = h('2h 4h 5h 6h 9h Kh 3c');
    expect(rank.category).toBe(HandCategory.Flush);
    expect(rank.values).toEqual([13, 9, 6, 5, 4]);
  });

  it('7장 중 스트레이트가 길게 이어지면 가장 높은 5장을 쓴다', () => {
    expect(h('4c 5d 6h 7s 8d 9c Tc').values).toEqual([10]);
  });

  it('A와 페어가 섞인 A-5 스트레이트', () => {
    const rank = h('Ac Ad 2h 3s 4d 5c Kh');
    expect(rank.category).toBe(HandCategory.Straight);
    expect(rank.values).toEqual([5]);
  });

  it('트리플이 2개면 높은 쪽이 트리플, 낮은 쪽이 페어인 풀하우스', () => {
    const rank = h('9c 9d 9h 4s 4d 4c Ac');
    expect(rank.category).toBe(HandCategory.FullHouse);
    expect(rank.values).toEqual([9, 4]);
    expect(best('9c 9d 9h 4s 4d 4c Ac')).toEqual(['9c', '9d', '9h', '4s', '4d']);
  });

  it('트리플 + 페어 2개면 더 높은 페어를 쓴다', () => {
    expect(h('7c 7d 7h 2s 2d Qc Qh').values).toEqual([7, 12]);
  });

  it('페어가 3개면 높은 페어 2개 + 남은 카드 중 가장 높은 키커', () => {
    const rank = h('Kc Kd 8h 8s 3d 3c 2h');
    expect(rank.category).toBe(HandCategory.TwoPair);
    expect(rank.values).toEqual([13, 8, 3]);
    // 세 번째 페어보다 높은 단일 카드가 있으면 그것이 키커
    expect(h('Kc Kd 8h 8s 3d 3c Qh').values).toEqual([13, 8, 12]);
  });

  it('포카드 + 트리플이면 포카드에 가장 높은 키커', () => {
    const rank = h('6c 6d 6h 6s Kd Kc Kh');
    expect(rank.category).toBe(HandCategory.Quads);
    expect(rank.values).toEqual([6, 13]);
  });

  it('입력 카드가 1~7장이 아니거나 중복이면 예외를 던진다', () => {
    expect(() => evaluateHand([])).toThrow();
    expect(() => h('2c 3c 4c 5c 6c 7c 8c 9c')).toThrow();
    expect(() => h('As As Kd Qh Jc')).toThrow('같은 카드');
  });
});

describe('같은 족보끼리 비교 (키커)', () => {
  it('포카드: 포카드 숫자 → 키커', () => {
    expectStronger('8c 8d 8h 8s 2d', '7c 7d 7h 7s Ad');
    expectStronger('Ac Ad Ah As 9d Kc 2h', 'Ac Ad Ah As 9d Qc 2h');
  });

  it('풀하우스: 트리플 숫자 → 페어 숫자', () => {
    expectStronger('3c 3d 3h 2s 2d', '2c 2h 2s Ad Ac');
    expectStronger('Tc Td Th 5s 5d', 'Tc Td Th 4s 4d');
  });

  it('플러시: 높은 카드부터 5장을 차례로 비교', () => {
    expectStronger('Ah Jh 8h 6h 3h', 'Ad Jd 8d 6d 2d');
    expectStronger('Kh Qh 8h 6h 3h', 'Kd Jd Td 9d 7d');
  });

  it('스트레이트: 가장 높은 카드만 비교', () => {
    expectTie('9c 8d 7h 6s 5d', '9h 8c 7d 6c 5h');
  });

  it('트리플: 트리플 숫자 → 키커 2장', () => {
    expectStronger('5c 5d 5h Ks 2d', '5c 5d 5s Qs Jd');
    expectStronger('5c 5d 5h Ks 3d', '5s 5d 5h Kc 2d');
  });

  it('투페어: 높은 페어 → 낮은 페어 → 키커', () => {
    expectStronger('Kc Kd 3h 3s 2d', 'Qc Qd Jh Js Ad');
    expectStronger('Kc Kd 5h 5s 2d', 'Kh Ks 4h 4s Ad');
    expectStronger('Kc Kd 5h 5s 9d', 'Kh Ks 5c 5d 8d');
  });

  it('원페어: 페어 숫자 → 키커 3장', () => {
    expectStronger('9c 9d Ah 5s 2d', '9h 9s Kh Qs Jd');
    expectStronger('9c 9d Ah 5s 3d', '9h 9s Ac 5d 2d');
  });

  it('하이카드: 높은 카드부터 5장', () => {
    expectStronger('Ac Qd 9h 5s 3d', 'Ah Qs 9c 5d 2d');
  });

  it('7장 중 6·7번째 카드는 우열에 영향을 주지 않는다', () => {
    expectTie('Ac Kd Qh 9s 7d 3c 2h', 'Ah Ks Qc 9d 7c 4d 3s');
  });
});

describe('완전 동점과 팟 분할', () => {
  it('무늬만 다르면 무승부다 (무늬는 우열에 영향 없음)', () => {
    expectTie('As Kd Qh Jc 9s', 'Ah Ks Qd Js 9c');
    expectTie('Ah Jh 8h 6h 3h', 'As Js 8s 6s 3s');
  });

  it('홀덤에서 보드가 최고 패면 모두 무승부', () => {
    const board = 'Ac Kc Qc Jc Tc';
    const hands = [h(`${board} 2d 3h`), h(`${board} 9d 9h`), h(`${board} As Ks`)];
    expect(findWinners(hands)).toEqual([0, 1, 2]);
  });

  it('findWinners는 가장 높은 사람만, 동점이면 여러 명을 돌려준다', () => {
    const hands = [h('2c 2d 5h 7s 9d'), h('Ac Ad 5c 7c 9c'), h('Ah As 5d 7d 9h')];
    expect(findWinners(hands)).toEqual([1, 2]);
  });
});

describe('5장 미만 판정 (7포커 오픈 카드 비교용)', () => {
  it('오픈 카드 2~4장으로 페어/트리플/하이카드를 판정한다', () => {
    expect(h('Kc Kd').category).toBe(HandCategory.OnePair);
    expect(h('9c 9d 9h 2s').category).toBe(HandCategory.Trips);
    expect(h('Ac 5d 3h').category).toBe(HandCategory.HighCard);
    expect(h('Ac Kc Qc Jc').category).toBe(HandCategory.HighCard); // 4장은 스트레이트/플러시 불가
    expectStronger('3c 3d', 'Ac Kd');
  });
});
