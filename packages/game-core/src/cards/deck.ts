import { RANKS, SUITS, type Card } from './card.js';

/**
 * 0 이상 maxExclusive 미만의 정수를 균등하게 돌려주는 난수 함수.
 * 서버에서는 반드시 `crypto.randomInt`를 넣는다. (game-core는 런타임 API에 의존하지 않는다)
 */
export type RandomInt = (maxExclusive: number) => number;

/** 정렬된 52장 새 덱 (스페이드 2 → 클로버 A 순서) */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

/**
 * Fisher-Yates 셔플. 원본을 바꾸지 않고 새 배열을 돌려준다.
 * 편향이 없도록 i번째 위치는 [0, i] 범위에서 균등하게 고른다.
 */
export function shuffle<T>(items: readonly T[], randomInt: RandomInt): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    if (!Number.isInteger(j) || j < 0 || j > i) {
      throw new Error(`난수 함수가 범위를 벗어난 값을 돌려주었습니다: ${j} (0~${i})`);
    }
    const tmp = result[i] as T;
    result[i] = result[j] as T;
    result[j] = tmp;
  }
  return result;
}

/** 덱 맨 위에서 count장을 뽑는다. 덱이 모자라면 예외를 던진다. */
export function draw<T>(deck: readonly T[], count: number): { drawn: T[]; rest: T[] } {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`뽑을 장수가 올바르지 않습니다: ${count}`);
  }
  if (count > deck.length) {
    throw new Error(`덱에 카드가 부족합니다: 필요 ${count}장, 남은 ${deck.length}장`);
  }
  return { drawn: deck.slice(0, count), rest: deck.slice(count) };
}
