/** 카드 무늬: S=스페이드, H=하트, D=다이아, C=클로버 */
export type Suit = 'S' | 'H' | 'D' | 'C';

/** 카드 숫자: 2~10, 11=J, 12=Q, 13=K, 14=A (A는 기본적으로 가장 높은 카드) */
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card {
  readonly rank: Rank;
  readonly suit: Suit;
}

export const SUITS: readonly Suit[] = ['S', 'H', 'D', 'C'];
export const RANKS: readonly Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

export const SUIT_NAMES_KO: Readonly<Record<Suit, string>> = {
  S: '스페이드',
  H: '하트',
  D: '다이아',
  C: '클로버',
};

const RANK_CHARS: Readonly<Record<Rank, string>> = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
  10: 'T', 11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};

const CHAR_TO_RANK: Readonly<Record<string, Rank>> = Object.fromEntries(
  Object.entries(RANK_CHARS).map(([rank, ch]) => [ch, Number(rank) as Rank]),
);

/** 화면 표시용 숫자 (10은 "10") */
export function rankLabel(rank: Rank): string {
  return rank === 10 ? '10' : RANK_CHARS[rank];
}

/** 카드를 짧은 문자열로 바꾼다. 예: A♠ → "As", 10♦ → "Td" */
export function cardToString(card: Card): string {
  return RANK_CHARS[card.rank] + card.suit.toLowerCase();
}

/** "As", "Td", "10h" 같은 문자열을 카드로 바꾼다. 형식이 틀리면 예외를 던진다. */
export function parseCard(text: string): Card {
  const trimmed = text.trim();
  const match = /^(10|[2-9TJQKA])([shdcSHDC])$/.exec(trimmed);
  if (!match) {
    throw new Error(`잘못된 카드 표기입니다: "${text}"`);
  }
  const rankText = match[1] === '10' ? 'T' : (match[1] as string).toUpperCase();
  const rank = CHAR_TO_RANK[rankText];
  if (rank === undefined) {
    throw new Error(`잘못된 카드 숫자입니다: "${text}"`);
  }
  return { rank, suit: (match[2] as string).toUpperCase() as Suit };
}

/** 공백으로 구분된 여러 장을 한 번에 바꾼다. 예: "As Kd 7c" */
export function parseCards(text: string): Card[] {
  return text.split(/\s+/).filter(Boolean).map(parseCard);
}

export function cardEquals(a: Card, b: Card): boolean {
  return a.rank === b.rank && a.suit === b.suit;
}

/** 0~51 사이의 고유 번호 (중복 검사 등에 사용) */
export function cardIndex(card: Card): number {
  return SUITS.indexOf(card.suit) * 13 + (card.rank - 2);
}
