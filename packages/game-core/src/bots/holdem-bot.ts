import type { Card } from '../cards/card.js';
import { evaluateHand, HandCategory } from '../hand/evaluate.js';
import type { HoldemAction, HoldemLegalAction, HoldemView } from '../holdem/engine.js';
import { BOT_CONFIG, type BotConfig, type BotRandom } from './config.js';

/**
 * 프리플랍 홀카드 점수 (Chen 공식). 대략 -1(7·2 다른 무늬) ~ 20(A 페어).
 * 몬테카를로 없이 사람들이 실제로 쓰는 손 계산법이다.
 */
export function chenScore(hole: readonly Card[]): number {
  const [a, b] = hole as [Card, Card];
  const hi = Math.max(a.rank, b.rank);
  const lo = Math.min(a.rank, b.rank);
  const points = (r: number) => (r === 14 ? 10 : r === 13 ? 8 : r === 12 ? 7 : r === 11 ? 6 : r / 2);
  let score = points(hi);
  if (hi === lo) return Math.max(5, score * 2);
  if (a.suit === b.suit) score += 2;
  const gap = hi - lo - 1;
  score -= gap === 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
  if (gap <= 1 && hi < 12) score += 1;
  return Math.ceil(score);
}

/** 프리플랍 홀카드 강도 (0~1). Chen 점수를 정규화한 값 */
export function preflopStrength(hole: readonly Card[]): number {
  return Math.min(1, Math.max(0, (chenScore(hole) + 1) / 21));
}

/** 남은 카드로 완성될 수 있는 드로우의 아웃(outs) 수. 내 홀카드가 보탬이 되는 드로우만 센다 */
function drawOuts(hole: readonly Card[], board: readonly Card[]): { outs: number; flush: boolean; straight: boolean } {
  const all = [...hole, ...board];
  let flush = false;
  for (const suit of ['S', 'H', 'D', 'C'] as const) {
    const n = all.filter((c) => c.suit === suit).length;
    if (n === 4 && hole.some((c) => c.suit === suit)) flush = true;
  }
  const has = (cards: readonly Card[]) => {
    const set = new Set<number>();
    for (const c of cards) {
      set.add(c.rank);
      if (c.rank === 14) set.add(1);
    }
    return set;
  };
  const ranks = has(all);
  const boardRanks = has(board);
  let open = false;
  let gut = false;
  for (let low = 1; low <= 10; low++) {
    const window = [0, 1, 2, 3, 4].map((k) => low + k);
    const inAll = window.filter((r) => ranks.has(r)).length;
    const inBoard = window.filter((r) => boardRanks.has(r)).length;
    if (inAll !== 4 || inBoard === 4) continue;
    const missing = window.find((r) => !ranks.has(r))!;
    if (missing === low || missing === low + 4) open = true;
    else gut = true;
  }
  const straight = open || gut;
  const outs = (flush ? 9 : 0) + (open ? 8 : gut ? 4 : 0) - (flush && straight ? 2 : 0);
  return { outs, flush, straight };
}

export interface HoldemHandRead {
  /** 지금 완성된 패의 상대적 강도 (0~1) */
  made: number;
  /** 다음 카드들로 좋아질 확률 근사 (0~1) */
  drawEquity: number;
  /** 바로 베팅할 만큼 강한지 */
  value: boolean;
}

/**
 * 내 패 읽기. 내 홀카드와 공개된 보드만 쓴다.
 * 보드만으로 만들어진 족보는 내 것이 아니므로 낮게 보고, 톱 페어·오버 페어·키커처럼 사람이 보는 기준으로 나눈다.
 */
export function readHoldemHand(hole: readonly Card[], board: readonly Card[], opponents: number): HoldemHandRead {
  const mine = evaluateHand([...hole, ...board]);
  const boardOnly = evaluateHand(board);
  const boardRanks = board.map((c) => c.rank).sort((a, b) => b - a);
  const topBoard = boardRanks[0]!;
  const holeRanks = hole.map((c) => c.rank);
  const pocketPair = holeRanks[0] === holeRanks[1];
  let made: number;

  const usesHole = mine.score > boardOnly.score;
  // 족보 종류는 보드가 만들고 내 카드는 키커만 보탠 경우 (보드 페어에 A 키커 등)
  const kickerOnly = usesHole && boardOnly.category === mine.category;
  if (kickerOnly && mine.category >= HandCategory.Straight) {
    made = 0.55; // 보드 스트레이트·플러시를 내 카드가 조금 높인 정도
  } else if (!usesHole || kickerOnly) {
    // 보드가 다 만들어 준 패: 높은 홀카드 정도의 가치
    made = 0.12 + ((Math.max(...holeRanks) - 2) / 12) * 0.12;
  } else {
    switch (mine.category) {
      case HandCategory.OnePair: {
        const pairRank = mine.values[0]!;
        const kicker = Math.max(...holeRanks.filter((r) => r !== pairRank), 2);
        if (pocketPair && pairRank > topBoard) made = 0.68 + ((pairRank - 2) / 12) * 0.1; // 오버 페어
        else if (pairRank === topBoard) made = 0.52 + ((kicker - 2) / 12) * 0.12; // 톱 페어
        else if (pairRank >= (boardRanks[1] ?? 0)) made = 0.4; // 미들 페어
        else made = 0.3; // 바텀 페어·보드 아래 페어
        break;
      }
      case HandCategory.TwoPair:
        // 홀카드 두 장이 모두 쓰인 투페어가 훨씬 강하다
        made = boardOnly.category === HandCategory.OnePair ? 0.6 : 0.78;
        break;
      case HandCategory.Trips:
        made = pocketPair ? 0.88 : 0.8; // 셋 / 트립스
        break;
      case HandCategory.Straight:
        made = 0.86;
        break;
      case HandCategory.Flush:
        made = 0.9 + (hole.some((c) => c.rank === 14) ? 0.05 : 0);
        break;
      default:
        made = mine.category >= HandCategory.FullHouse ? 0.97 : 0.1 + ((Math.max(...holeRanks) - 2) / 12) * 0.12;
    }
  }

  // 보드가 위험하면(같은 무늬 4장, 페어 보드) 원페어·투페어는 깎는다
  const suitMax = Math.max(...(['S', 'H', 'D', 'C'] as const).map((s) => board.filter((c) => c.suit === s).length));
  if (mine.category <= HandCategory.TwoPair && suitMax >= 4) made -= 0.15;
  else if (mine.category <= HandCategory.OnePair && suitMax === 3) made -= 0.05;
  // 상대가 많을수록 원페어는 이기기 어렵다
  if (mine.category <= HandCategory.TwoPair) made -= Math.max(0, opponents - 1) * 0.05;

  const cardsToCome = 5 - board.length;
  const { outs } = cardsToCome > 0 && mine.category < HandCategory.Straight ? drawOuts(hole, board) : { outs: 0 };
  // 2·4 법칙: 남은 카드 1장이면 아웃×2%, 2장이면 아웃×4%
  const drawEquity = Math.min(0.6, (outs * (cardsToCome === 2 ? 4 : 2)) / 100);

  made = Math.min(1, Math.max(0, made));
  return { made, drawEquity, value: made >= 0.52 };
}

/** 예전 호환용: 하나의 숫자로 본 패 강도 */
export function estimateHoldemStrength(view: HoldemView): number {
  const me = view.players.find((p) => p.id === view.myId);
  if (!me) return 0;
  const hole = me.hole.filter((c): c is Card => c !== null);
  if (view.board.length === 0) return preflopStrength(hole);
  const opponents = view.players.filter((p) => p.id !== me.id && !p.folded).length;
  const read = readHoldemHand(hole, view.board, opponents);
  return Math.min(1, read.made + read.drawEquity * 0.5);
}

/** 버튼에서 몇 자리 앞인지 (0이면 버튼, 클수록 먼저 액션하는 자리) */
function seatsFromButton(view: HoldemView): number {
  const ids = view.players.map((p) => p.id);
  const n = ids.length;
  return (ids.indexOf(view.buttonId) - ids.indexOf(view.myId ?? '') + n) % n;
}

const clampTo = (a: HoldemLegalAction, to: number) => Math.min(a.max!, Math.max(a.min!, Math.round(to)));

/**
 * 홀덤 봇의 액션 결정. view.legalActions 안에서만 고른다.
 * 입력은 봇 자신의 시야뿐이라 상대 홀카드, 번 카드, 덱을 볼 수 없다.
 *
 * 사람처럼 치도록 한 것:
 * - 프리플랍: Chen 점수로 손을 나누고, 자리(포지션)와 앞사람 레이즈에 따라 레이즈·콜·폴드. 뒷자리에서는 블라인드를 훔친다.
 * - 플랍 이후: 톱 페어·오버 페어·셋 같은 기준으로 패를 읽고, 드로우는 2·4 법칙으로 콜 여부를 정한다.
 * - 프리플랍에 레이즈한 사람은 플랍에서 자주 이어서 베팅하고, 드로우로 세미 블러프, 강한 패는 가끔 슬로플레이한다.
 * - 베팅 크기를 매번 조금씩 다르게 한다.
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
  const hole = me.hole.filter((c): c is Card => c !== null);
  const opponents = view.players.filter((p) => p.id !== me.id && !p.folded).length;
  const toCall = call?.amount ?? 0;
  const potOdds = toCall > 0 ? toCall / (view.pot + toCall) : 0;
  const fromButton = seatsFromButton(view);
  const late = fromButton <= 1;
  const bb = view.bigBlind;
  const vary = (lo: number, hi: number) => lo + random() * (hi - lo);

  /** 팟 대비 비율로 베팅/레이즈 (총액 기준) */
  const potBet = (ratio: number): HoldemAction | null => {
    if (bet) return { type: 'bet', amount: clampTo(bet, view.pot * ratio) };
    if (raise) return { type: 'raise', amount: clampTo(raise, view.currentBet + (view.pot + toCall) * ratio) };
    return null;
  };
  /** 지금 베팅의 배수로 레이즈 */
  const raiseTo = (to: number): HoldemAction | null => {
    if (raise) return { type: 'raise', amount: clampTo(raise, to) };
    if (bet) return { type: 'bet', amount: clampTo(bet, to) };
    return null;
  };
  const passive = (): HoldemAction => (check ? { type: 'check' } : { type: 'call' });
  const fold = (): HoldemAction => (check ? { type: 'check' } : { type: 'fold' });

  let choice: HoldemAction;
  if (view.board.length === 0) {
    // ───── 프리플랍 ─────
    const chen = chenScore(hole);
    const raisers = view.log.filter((e) => e.street === 'preflop' && (e.action === 'raise' || e.action === 'bet' || (e.action === 'allin' && e.amount > bb))).length;
    const facingBB = toCall / bb; // 콜하려면 빅블라인드 몇 개가 드는지
    const limpers = view.players.filter((p) => p.id !== me.id && !p.folded && p.roundBet === bb).length - 1;
    const isBB = view.bigBlindId === me.id;
    // 둘만 남으면 손 범위가 훨씬 넓어진다 (사람도 헤즈업에서는 넓게 친다)
    const headsUp = opponents === 1;
    const wide = headsUp ? 3 : 0;

    if (raisers === 0) {
      // 아무도 레이즈하지 않음: 오픈 레이즈 / 림프 / 훔치기
      const openTo = bb * vary(config.openRaiseBB[0], config.openRaiseBB[1]) + Math.max(0, limpers) * bb;
      const openNeed = (late ? 6 : fromButton <= 3 ? 8 : 9) - wide;
      if (chen >= openNeed || (chen >= 12 && random() < 0.95)) {
        choice = raiseTo(openTo) ?? passive();
      } else if (late && limpers <= 0 && chen >= 3 && random() < config.stealRate) {
        choice = raiseTo(openTo) ?? passive();
      } else if (chen >= 6 && (late || isBB || facingBB <= 0.5)) {
        // 싼 값에 보거나 빅블라인드에서 그냥 체크
        choice = passive();
      } else {
        choice = fold();
      }
    } else if (raisers === 1) {
      // 한 번 레이즈된 팟: 3벳 / 콜 / 폴드
      if (chen >= 12 || (chen >= 10 && random() < config.aggression * 0.45)) {
        choice = raiseTo(view.currentBet * vary(2.8, 3.4)) ?? passive();
      } else if (chen >= 8 - wide * 0.5 && facingBB <= 5) {
        choice = passive();
      } else if (headsUp && facingBB > 5 && chen >= 6) {
        // 헤즈업에서 큰 레이즈·올인을 받으면 괜찮은 패로는 받아 준다
        choice = passive();
      } else if (chen >= 6 - wide && facingBB <= (isBB || late || headsUp ? 3.2 : 2.2)) {
        // 작은 페어·수티드 커넥터는 싸게 들어가 큰 패를 노린다
        choice = passive();
      } else {
        choice = fold();
      }
    } else {
      // 3벳 이상: 아주 좋은 패만
      if (chen >= 14 || (chen >= 12 && random() < config.aggression * 0.5)) {
        choice = raiseTo(view.currentBet * vary(2.2, 2.6)) ?? passive();
      } else if ((chen >= 11 && facingBB <= 12) || (headsUp && chen >= 6)) {
        choice = passive();
      } else {
        choice = fold();
      }
    }
    // 올인을 받아야 하는 콜은 프리미엄 패만
    if (choice.type === 'call' && call?.allIn && chen < (headsUp ? 5 : 11) && potOdds < 0.45) choice = fold();
  } else {
    // ───── 플랍 이후 ─────
    const read = readHoldemHand(hole, view.board, opponents);
    const river = view.board.length === 5;
    const drawEq = river ? 0 : read.drawEquity;
    const streetLog = view.log.filter((e) => e.street === view.street);
    const iRaisedPreflop =
      [...view.log].reverse().find((e) => e.street === 'preflop' && (e.action === 'raise' || e.action === 'bet' || e.action === 'allin'))?.playerId === me.id;
    const betRatio = toCall > 0 ? toCall / Math.max(1, view.pot - toCall) : 0; // 상대가 판돈의 몇 배를 걸었는지
    const someoneRaisedHere = streetLog.filter((e) => e.action === 'raise').length > 0;

    if (toCall === 0) {
      // 아무도 베팅하지 않음
      if (read.made >= 0.85) {
        choice = random() < config.slowplayRate && !river ? { type: 'check' } : (potBet(vary(0.55, 0.85)) ?? passive());
      } else if (read.made >= 0.6) {
        choice = potBet(vary(0.45, 0.75)) ?? passive();
      } else if (read.made >= 0.45) {
        // 톱 페어 근처: 얇게 가치 베팅하거나 체크
        choice = random() < (late ? 0.6 : 0.4) ? (potBet(vary(0.33, 0.55)) ?? passive()) : { type: 'check' };
      } else if (drawEq >= 0.15 && random() < config.semiBluffRate) {
        choice = potBet(vary(0.4, 0.66)) ?? passive();
      } else if (iRaisedPreflop && view.street === 'flop' && random() < config.cbetRate * (opponents === 1 ? 1 : 0.45)) {
        choice = potBet(vary(0.3, 0.5)) ?? passive(); // 컨티뉴에이션 베팅
      } else if (opponents === 1 && random() < config.bluffRate * (late ? 1.5 : 1)) {
        choice = potBet(vary(0.4, 0.66)) ?? passive();
      } else {
        choice = { type: 'check' };
      }
    } else {
      // 베팅을 받음: 큰 베팅일수록 더 강한 패가 필요하다
      const need = potOdds + config.callMargin + (someoneRaisedHere ? 0.08 : 0);
      const pressure = Math.max(0, betRatio - 0.6) * 0.15;
      const effective = read.made - pressure;
      if (read.made >= 0.86) {
        choice = random() < config.aggression * 0.75 ? (raiseTo(view.currentBet * vary(2.4, 3.2)) ?? passive()) : passive();
      } else if (call?.allIn && opponents === 1 && (read.made >= 0.45 || drawEq >= 0.3)) {
        // 헤즈업 올인: 톱 페어 이상이나 큰 드로우면 받는다 (매번 접으면 올인만으로 당한다)
        choice = passive();
      } else if (effective >= 0.62) {
        choice = !someoneRaisedHere && random() < config.aggression * 0.25 ? (raiseTo(view.currentBet * vary(2.5, 3)) ?? passive()) : passive();
      } else if (effective >= 0.4 && effective >= need) {
        choice = passive();
      } else if (drawEq > 0 && drawEq + 0.06 >= need) {
        // 드로우: 팟 오즈가 맞으면 콜, 가끔 세미 블러프 레이즈
        choice = view.street === 'flop' && !someoneRaisedHere && random() < config.semiBluffRate * 0.35 ? (raiseTo(view.currentBet * 2.6) ?? passive()) : passive();
      } else if (opponents === 1 && betRatio <= 0.5 && (read.made >= 0.2 || (view.street === 'flop' && random() < 0.3))) {
        // 작은 베팅에는 약한 페어나 높은 카드로도 한 번 버틴다 (플랍에서는 가끔 아무것도 없이 따라가 본다)
        choice = passive();
      } else {
        choice = fold();
      }
      if (choice.type === 'call' && call?.allIn && read.made < (opponents === 1 ? 0.38 : 0.6) && drawEq + 0.05 < potOdds) choice = fold();
    }
  }

  // 가벼운 실수: 차선의 선택 (공짜로 볼 수 있을 때 폴드하는 실수는 하지 않음)
  if (random() < config.mistakeRate) {
    if (choice.type === 'fold' && call && toCall <= view.pot * 0.35) choice = { type: 'call' };
    else if (choice.type === 'bet' || choice.type === 'raise') choice = passive();
    else if (choice.type === 'check' && random() < 0.5) choice = potBet(0.4) ?? choice;
  }

  // 남은 칩을 거의 다 거는 베팅이면 올인으로 정리
  if ((choice.type === 'bet' || choice.type === 'raise') && choice.amount! >= (me.roundBet + me.stack) * 0.85) {
    choice = has('allin') ? { type: 'allin' } : choice;
  }
  return choice;
}
