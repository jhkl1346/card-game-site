import { classifyMeld, hulaCardId, hulaCardPoints, isJoker, type HulaCard } from '../hula/meld.js';
import type { HulaAction, HulaView } from '../hula/engine.js';
import { BOT_CONFIG, type BotConfig, type BotRandom } from './config.js';

/** 이미 공개된(버려졌거나 등록된) 같은 숫자 카드 수 */
function seenRank(view: HulaView, rank: number): number {
  const seen = [...view.discardPile, ...view.melds.flatMap((m) => m.cards)];
  return seen.filter((c) => !isJoker(c) && c.rank === rank).length;
}

/**
 * 손패에 남겨 둘 가치 (높을수록 버리기 아까움).
 * 같은 숫자 짝, 같은 무늬 이웃 카드를 높게 보고, 이미 많이 나온 숫자는 낮게 본다.
 */
function keepValue(view: HulaView, hand: readonly HulaCard[], index: number): number {
  const card = hand[index]!;
  if (isJoker(card)) return 100;
  let value = 0;
  hand.forEach((other, j) => {
    if (j === index || isJoker(other)) return;
    if (other.rank === card.rank) value += seenRank(view, card.rank) >= 2 ? 2 : 6;
    if (other.suit === card.suit) {
      const diff = Math.abs(other.rank - card.rank);
      if (diff === 1) value += 4;
      else if (diff === 2) value += 2;
    }
  });
  return value;
}

/** 이 카드를 버리면 다른 사람이 테이블 멜드에 바로 붙일 수 있는지 */
function feedsTable(view: HulaView, card: HulaCard): boolean {
  return view.melds.some((m) => classifyMeld([...m.cards, card], view.rules, false) !== null);
}

/**
 * 훌라 봇의 다음 액션 하나를 고른다 (서버는 차례가 넘어갈 때까지 반복 호출).
 * view.legalActions 안에서만 고르며, 입력은 봇 자신의 시야뿐이라 남의 손패나 덱을 볼 수 없다.
 * - 버린 카드 추적: 이미 나온 숫자는 멜드 가능성이 낮다고 본다.
 * - 멜드 가능성: 짝·이웃 카드를 남기고, 점수 높은 카드부터 버린다.
 */
export function decideHulaAction(
  view: HulaView,
  random: BotRandom = Math.random,
  config: BotConfig = BOT_CONFIG,
): HulaAction {
  const legal = view.legalActions;
  if (legal.length === 0) throw new Error('봇이 할 수 있는 액션이 없습니다');
  const hand = view.myHand;

  if (view.phase === 'draw') {
    const stop = legal.find((a) => a.type === 'stop');
    if (stop) {
      // 상대 손패가 아직 많거나 내 점수가 아주 낮으면 스톱
      const othersBusy = view.players.filter((p) => p.id !== view.myId).every((p) => p.handCount >= 4);
      const threshold = view.rules.stopMaxPoints * (othersBusy ? 1 : 0.5);
      if (view.myPoints <= threshold && random() >= config.mistakeRate) return stop;
    }
    return legal.find((a) => a.type === 'drawDiscard') ?? { type: 'drawDeck' };
  }

  // 등록·붙이기: 가장 많은 카드(점수)를 털어내는 것부터
  const plays = legal.filter((a) => a.type === 'meld' || a.type === 'layoff');
  if (plays.length > 0) {
    const pointsOf = (ids: readonly string[]) =>
      ids.reduce((sum, id) => sum + hulaCardPoints(hand.find((c) => hulaCardId(c) === id)!, view.rules), 0);
    const scored = plays
      .map((a) => ({ a, score: a.cards.length * 100 + pointsOf(a.cards) }))
      .sort((x, y) => y.score - x.score);
    // 가끔 등록을 미루는 실수 (버린 카드를 써야 할 때는 미룰 수 없음)
    const canDelay = !view.mustUse && legal.some((a) => a.type === 'discard');
    if (!(canDelay && random() < config.mistakeRate / 2)) return scored[0]!.a;
  }

  const discards = legal.filter((a): a is Extract<HulaAction, { type: 'discard' }> => a.type === 'discard');
  const ranked = discards
    .map((a) => {
      const index = hand.findIndex((c) => hulaCardId(c) === a.card);
      const card = hand[index]!;
      const score = hulaCardPoints(card, view.rules) - keepValue(view, hand, index) - (feedsTable(view, card) ? 8 : 0);
      return { a, score };
    })
    .sort((x, y) => y.score - x.score);
  const pickSecond = ranked.length > 1 && random() < config.mistakeRate;
  return (pickSecond ? ranked[1] : ranked[0])!.a;
}

