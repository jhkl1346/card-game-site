import type { Card } from '../cards/card.js';
import { createDeck, shuffle, type RandomInt } from '../cards/deck.js';
import { evaluateHand, type HandCategory, type HandRank } from '../hand/evaluate.js';
import { computePots, splitPot } from '../engine/pots.js';
import {
  GameRuleError,
  type GameEngine,
  type GameResultBase,
  type PlayerInit,
} from '../engine/types.js';
import {
  DEFAULT_HOLDEM_RULES,
  type HoldemActionType,
  type HoldemRules,
  type HoldemStreet,
} from './rules.js';

export const HOLDEM_MIN_PLAYERS = 2;
export const HOLDEM_MAX_PLAYERS = 9;
const STREETS: readonly HoldemStreet[] = ['preflop', 'flop', 'turn', 'river'];

export interface HoldemOptions {
  smallBlind: number;
  bigBlind: number;
  /** 딜러 버튼 자리 번호 (기본 0). 다음 판은 nextButtonIndex로 정한다. */
  buttonIndex?: number;
  rules?: Partial<HoldemRules>;
  /** 셔플용 난수 함수. 서버에서는 crypto.randomInt를 넣는다. */
  randomInt?: RandomInt;
  /** 테스트 전용: 미리 순서를 정한 덱. 실제 게임에서는 절대 쓰지 않는다. */
  stackedDeck?: readonly Card[];
}

/** bet/raise의 amount는 "이번 라운드에 내가 낸 총액(to)" */
export interface HoldemAction {
  type: HoldemActionType;
  amount?: number;
}

export interface HoldemLegalAction {
  type: HoldemActionType;
  /** call·allin: 이 액션으로 더 내는 칩 */
  amount?: number;
  /** bet·raise: 가능한 총액(to) 범위 */
  min?: number;
  max?: number;
  allIn?: boolean;
}

export interface HoldemPlayerState {
  id: string;
  name: string;
  isBot: boolean;
  startChips: number;
  stack: number;
  hole: Card[];
  folded: boolean;
  allIn: boolean;
  roundBet: number;
  totalBet: number;
  acted: boolean;
  canRaise: boolean;
}

export interface HoldemLogEntry {
  street: HoldemStreet;
  playerId: string;
  action: HoldemActionType | 'smallBlind' | 'bigBlind';
  /** 이 액션으로 낸 칩 */
  amount: number;
  allIn: boolean;
}

export interface HoldemPotResult {
  amount: number;
  eligible: string[];
  winners: string[];
  shares: Record<string, number>;
}

export interface HoldemShownHand {
  hole: Card[];
  category: HandCategory;
  name: string;
  cards: Card[];
}

export interface HoldemResult extends GameResultBase {
  reason: 'fold' | 'showdown';
  board: Card[];
  pots: HoldemPotResult[];
  hands: Record<string, HoldemShownHand>;
  winners: string[];
}

export interface HoldemState {
  readonly rules: HoldemRules;
  readonly smallBlind: number;
  readonly bigBlind: number;
  readonly button: number;
  readonly sbIndex: number;
  readonly bbIndex: number;
  readonly players: HoldemPlayerState[];
  /** 남은 덱 (서버 전용) */
  readonly deck: Card[];
  /** 번 카드 (서버 전용, 어떤 클라이언트에도 내용을 보내지 않음) */
  readonly burnedCards: Card[];
  readonly board: Card[];
  readonly street: HoldemStreet;
  readonly phase: 'betting' | 'finished';
  readonly currentBet: number;
  readonly lastRaiseSize: number;
  readonly toAct: number;
  readonly log: HoldemLogEntry[];
  readonly result: HoldemResult | null;
}

type Draft = { -readonly [K in keyof HoldemState]: HoldemState[K] };

function clone(state: HoldemState): Draft {
  return {
    ...state,
    players: state.players.map((p) => ({ ...p, hole: p.hole.slice() })),
    deck: state.deck.slice(),
    burnedCards: state.burnedCards.slice(),
    board: state.board.slice(),
    log: state.log.slice(),
  };
}

const potTotal = (s: HoldemState) => s.players.reduce((sum, p) => sum + p.totalBet, 0);
const canAct = (p: HoldemPlayerState) => !p.folded && !p.allIn;
const alive = (s: HoldemState) => s.players.filter((p) => !p.folded);
const nextSeat = (i: number, n: number) => (i + 1) % n;

/** 다음 판의 딜러 버튼 자리 */
export function nextButtonIndex(button: number, playerCount: number): number {
  return nextSeat(button, playerCount);
}

/** 판에 필요한 카드 수 (홀카드 + 번 카드 + 보드) */
export function holdemCardsNeeded(playerCount: number, rules: HoldemRules = DEFAULT_HOLDEM_RULES): number {
  const burns = [rules.burnBeforeFlop, rules.burnBeforeTurn, rules.burnBeforeRiver].filter(Boolean).length;
  return playerCount * 2 + burns + 5;
}

function put(p: HoldemPlayerState, amount: number): number {
  const paid = Math.min(amount, p.stack);
  p.stack -= paid;
  p.roundBet += paid;
  p.totalBet += paid;
  if (p.stack === 0) p.allIn = true;
  return paid;
}

function take(s: Draft): Card {
  const card = s.deck.shift();
  if (!card) throw new Error('덱에 카드가 부족합니다');
  return card;
}

function nextToAct(s: Draft, from: number): number {
  const n = s.players.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n;
    const p = s.players[i]!;
    if (canAct(p) && (!p.acted || p.roundBet < s.currentBet)) return i;
  }
  return -1;
}

/** 다음 거리(플랍·턴·리버)를 펼친다. 번 카드는 burnedCards에만 넣는다. */
function dealNextStreet(s: Draft): void {
  const next = STREETS[STREETS.indexOf(s.street) + 1]!;
  const burn =
    (next === 'flop' && s.rules.burnBeforeFlop) ||
    (next === 'turn' && s.rules.burnBeforeTurn) ||
    (next === 'river' && s.rules.burnBeforeRiver);
  if (burn) s.burnedCards.push(take(s));
  const count = next === 'flop' ? 3 : 1;
  for (let i = 0; i < count; i++) s.board.push(take(s));
  s.street = next;

  for (const p of s.players) {
    p.roundBet = 0;
    p.acted = false;
    p.canRaise = true;
  }
  s.currentBet = 0;
  s.lastRaiseSize = s.bigBlind;
}

/** 베팅 라운드가 끝났을 때: 다음 거리로 가거나, 베팅할 사람이 없으면 끝까지 펼친 뒤 쇼다운 */
function advance(s: Draft): void {
  while (s.street !== 'river') {
    dealNextStreet(s);
    if (s.players.filter(canAct).length >= 2) {
      s.toAct = nextToAct(s, s.button);
      return;
    }
  }
  showdown(s);
}

/** 버튼 왼쪽부터의 자리 순서 (홀수 칩 순서) */
function orderFromLeftOfButton(s: Draft): string[] {
  const n = s.players.length;
  return Array.from({ length: n }, (_, k) => s.players[(s.button + 1 + k) % n]!.id);
}

function finish(s: Draft, reason: HoldemResult['reason'], pots: HoldemPotResult[], hands: Record<string, HoldemShownHand>): void {
  const chipDeltas: Record<string, number> = {};
  const finalChips: Record<string, number> = {};
  for (const p of s.players) {
    chipDeltas[p.id] = p.stack - p.startChips;
    finalChips[p.id] = p.stack;
  }
  s.phase = 'finished';
  s.toAct = -1;
  s.result = {
    reason,
    board: s.board.slice(),
    pots,
    hands,
    winners: [...new Set(pots.flatMap((pot) => pot.winners))],
    chipDeltas,
    finalChips,
  };
}

function finishByFold(s: Draft): void {
  const winner = alive(s)[0]!;
  const amount = potTotal(s);
  winner.stack += amount;
  finish(s, 'fold', [{ amount, eligible: [winner.id], winners: [winner.id], shares: { [winner.id]: amount } }], {});
}

function showdown(s: Draft): void {
  const ranks = new Map<string, HandRank>();
  const hands: Record<string, HoldemShownHand> = {};
  for (const p of alive(s)) {
    const rank = evaluateHand([...p.hole, ...s.board]);
    ranks.set(p.id, rank);
    hands[p.id] = { hole: p.hole.slice(), category: rank.category, name: rank.name, cards: rank.cards };
  }
  const order = orderFromLeftOfButton(s);
  const pots = computePots(s.players.map((p) => ({ id: p.id, amount: p.totalBet, folded: p.folded })));
  const results = pots.map((pot) => {
    const best = Math.max(...pot.eligible.map((id) => ranks.get(id)!.score));
    const winners = pot.eligible
      .filter((id) => ranks.get(id)!.score === best)
      .sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const shares = splitPot(pot.amount, winners);
    for (const [id, share] of Object.entries(shares)) {
      s.players.find((p) => p.id === id)!.stack += share;
    }
    return { amount: pot.amount, eligible: pot.eligible, winners, shares };
  });
  finish(s, 'showdown', results, hands);
}

function legalActionsAt(s: HoldemState, index: number): HoldemLegalAction[] {
  if (s.phase !== 'betting' || s.toAct !== index) return [];
  const p = s.players[index]!;
  const toCall = s.currentBet - p.roundBet;
  const actions: HoldemLegalAction[] = [{ type: 'fold' }];

  if (toCall <= 0) actions.push({ type: 'check' });
  else actions.push({ type: 'call', amount: Math.min(toCall, p.stack), allIn: p.stack <= toCall });

  const othersCanRespond = s.players.some((o, i) => i !== index && canAct(o));
  if (p.canRaise && othersCanRespond && p.stack > toCall) {
    const maxTo = p.roundBet + p.stack;
    if (s.currentBet === 0) {
      if (maxTo > s.bigBlind) actions.push({ type: 'bet', min: s.bigBlind, max: maxTo });
    } else {
      const minRaiseTo = s.currentBet + s.lastRaiseSize;
      if (maxTo > minRaiseTo) actions.push({ type: 'raise', min: minRaiseTo, max: maxTo });
    }
    actions.push({ type: 'allin', amount: p.stack, allIn: true });
  }
  return actions;
}

// ───────────────────────── 공개 함수 (순수 함수) ─────────────────────────

export function createHoldem(players: readonly PlayerInit[], options: HoldemOptions): HoldemState {
  const n = players.length;
  if (n < HOLDEM_MIN_PLAYERS || n > HOLDEM_MAX_PLAYERS) {
    throw new GameRuleError(`텍사스 홀덤은 ${HOLDEM_MIN_PLAYERS}~${HOLDEM_MAX_PLAYERS}명이 할 수 있습니다`);
  }
  if (new Set(players.map((p) => p.id)).size !== n) throw new GameRuleError('같은 참가자가 두 번 들어 있습니다');
  const { smallBlind, bigBlind } = options;
  if (!Number.isInteger(smallBlind) || !Number.isInteger(bigBlind) || smallBlind < 1 || bigBlind < smallBlind) {
    throw new GameRuleError('블라인드는 1 이상의 정수이고, 빅블라인드가 스몰블라인드 이상이어야 합니다');
  }
  for (const p of players) {
    if (!Number.isInteger(p.chips) || p.chips < 1) throw new GameRuleError(`${p.name}님의 칩이 부족합니다`);
  }
  const button = options.buttonIndex ?? 0;
  if (!Number.isInteger(button) || button < 0 || button >= n) throw new GameRuleError('딜러 버튼 위치가 올바르지 않습니다');

  const rules: HoldemRules = { ...DEFAULT_HOLDEM_RULES, ...options.rules };
  if (holdemCardsNeeded(n, rules) > 52) throw new GameRuleError('필요한 카드 수가 덱보다 많습니다');

  let deck: Card[];
  if (options.stackedDeck) deck = options.stackedDeck.slice();
  else if (options.randomInt) deck = shuffle(createDeck(), options.randomInt);
  else throw new Error('셔플용 난수 함수(randomInt)가 필요합니다');

  // 헤즈업은 버튼이 SB
  const sbIndex = n === 2 ? button : nextSeat(button, n);
  const bbIndex = nextSeat(sbIndex, n);

  const s: Draft = {
    rules,
    smallBlind,
    bigBlind,
    button,
    sbIndex,
    bbIndex,
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot ?? false,
      startChips: p.chips,
      stack: p.chips,
      hole: [],
      folded: false,
      allIn: false,
      roundBet: 0,
      totalBet: 0,
      acted: false,
      canRaise: true,
    })),
    deck,
    burnedCards: [],
    board: [],
    street: 'preflop',
    phase: 'betting',
    currentBet: bigBlind,
    lastRaiseSize: bigBlind,
    toAct: -1,
    log: [],
    result: null,
  };

  const sb = s.players[sbIndex]!;
  const bb = s.players[bbIndex]!;
  s.log.push({ street: 'preflop', playerId: sb.id, action: 'smallBlind', amount: put(sb, smallBlind), allIn: sb.allIn });
  s.log.push({ street: 'preflop', playerId: bb.id, action: 'bigBlind', amount: put(bb, bigBlind), allIn: bb.allIn });

  // 홀카드: SB부터 한 장씩 두 바퀴
  for (let round = 0; round < 2; round++) {
    for (let k = 0; k < n; k++) s.players[(sbIndex + k) % n]!.hole.push(take(s));
  }

  s.toAct = nextToAct(s, bbIndex);
  if (s.toAct < 0) advance(s);
  return s;
}

export function getHoldemLegalActions(state: HoldemState, playerId: string): HoldemLegalAction[] {
  const index = state.players.findIndex((p) => p.id === playerId);
  return index < 0 ? [] : legalActionsAt(state, index);
}

export function applyHoldemAction(state: HoldemState, playerId: string, action: HoldemAction): HoldemState {
  if (state.phase === 'finished') throw new GameRuleError('이미 끝난 판입니다');
  const index = state.players.findIndex((p) => p.id === playerId);
  if (index < 0) throw new GameRuleError('이 판의 참가자가 아닙니다');
  if (state.toAct !== index) throw new GameRuleError('내 차례가 아닙니다');
  const legal = legalActionsAt(state, index).find((a) => a.type === action.type);
  if (!legal) throw new GameRuleError('지금은 할 수 없는 액션입니다');

  const s = clone(state);
  const p = s.players[index]!;
  let paid = 0;
  switch (action.type) {
    case 'fold':
      p.folded = true;
      break;
    case 'check':
      break;
    case 'call':
    case 'allin':
      paid = put(p, legal.amount!);
      break;
    case 'bet':
    case 'raise': {
      const to = action.amount;
      if (to === undefined || !Number.isInteger(to) || to < legal.min! || to > legal.max!) {
        throw new GameRuleError(
          `${action.type === 'bet' ? '벳' : '레이즈'} 금액은 ${legal.min!.toLocaleString('ko-KR')}~${legal.max!.toLocaleString('ko-KR')} 사이여야 합니다`,
        );
      }
      paid = put(p, to - p.roundBet);
      break;
    }
  }
  p.acted = true;

  const increment = p.roundBet - s.currentBet;
  if (increment > 0) {
    const opening = s.currentBet === 0;
    const fullRaise = opening || increment >= s.lastRaiseSize;
    for (const o of s.players) {
      if (o === p || !canAct(o)) continue;
      if (!fullRaise && o.acted) o.canRaise = false;
      if (fullRaise) o.canRaise = true;
      o.acted = false;
    }
    if (fullRaise) s.lastRaiseSize = opening ? Math.max(increment, s.bigBlind) : increment;
    s.currentBet = p.roundBet;
  }
  s.log.push({ street: s.street, playerId: p.id, action: action.type, amount: paid, allIn: p.allIn });

  if (alive(s).length === 1) {
    finishByFold(s);
    return s;
  }
  const next = nextToAct(s, index);
  if (next >= 0) s.toAct = next;
  else advance(s);
  return s;
}

/** 턴 시간이 지났을 때의 자동 액션: 체크할 수 있으면 체크, 아니면 폴드 */
export function holdemTimeoutAction(state: HoldemState, playerId: string): HoldemAction {
  const legal = getHoldemLegalActions(state, playerId);
  return { type: legal.some((a) => a.type === 'check') ? 'check' : 'fold' };
}

// ───────────────────────── 플레이어 시야 ─────────────────────────

export interface HoldemPlayerView {
  id: string;
  name: string;
  isBot: boolean;
  stack: number;
  folded: boolean;
  allIn: boolean;
  roundBet: number;
  totalBet: number;
  /** 볼 수 없으면 [null, null] */
  hole: Array<Card | null>;
}

export interface HoldemView {
  gameType: 'holdem';
  myId: string | null;
  rules: HoldemRules;
  smallBlind: number;
  bigBlind: number;
  buttonId: string;
  smallBlindId: string;
  bigBlindId: string;
  street: HoldemStreet;
  phase: HoldemState['phase'];
  pot: number;
  currentBet: number;
  toActId: string | null;
  board: Card[];
  /** 번 카드는 장수만 (내용은 절대 보내지 않음) */
  burnCount: number;
  /** 남은 덱은 장수만 */
  deckCount: number;
  players: HoldemPlayerView[];
  legalActions: HoldemLegalAction[];
  log: HoldemLogEntry[];
  result: HoldemResult | null;
}

/**
 * playerId가 봐도 되는 정보만 담은 시야.
 * - 남의 홀카드는 null, 번 카드와 남은 덱은 장수만.
 * - 쇼다운으로 끝났으면 끝까지 남은 사람의 홀카드를 공개한다. 번 카드는 끝나도 공개하지 않는다.
 */
export function getHoldemView(state: HoldemState, playerId: string | null): HoldemView {
  const revealAll = state.phase === 'finished' && state.result?.reason === 'showdown';
  const me = state.players.find((p) => p.id === playerId) ?? null;
  const idAt = (i: number) => state.players[i]!.id;
  return {
    gameType: 'holdem',
    myId: me ? me.id : null,
    rules: { ...state.rules },
    smallBlind: state.smallBlind,
    bigBlind: state.bigBlind,
    buttonId: idAt(state.button),
    smallBlindId: idAt(state.sbIndex),
    bigBlindId: idAt(state.bbIndex),
    street: state.street,
    phase: state.phase,
    pot: potTotal(state),
    currentBet: state.currentBet,
    toActId: state.toAct >= 0 ? idAt(state.toAct) : null,
    board: state.board.map((c) => ({ ...c })),
    burnCount: state.burnedCards.length,
    deckCount: state.deck.length,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      stack: p.stack,
      folded: p.folded,
      allIn: p.allIn,
      roundBet: p.roundBet,
      totalBet: p.totalBet,
      hole: p.hole.map((c) => (p === me || (revealAll && !p.folded) ? { ...c } : null)),
    })),
    legalActions: me ? getHoldemLegalActions(state, me.id) : [],
    log: state.log.map((e) => ({ ...e })),
    result: state.result,
  };
}

// ───────────────────────── GameEngine 구현 ─────────────────────────

export class HoldemEngine
  implements GameEngine<HoldemOptions, HoldemAction, HoldemView, HoldemResult, HoldemLegalAction>
{
  private state: HoldemState | null = null;

  init(players: readonly PlayerInit[], options: HoldemOptions): void {
    this.state = createHoldem(players, options);
  }

  /** 서버 내부 전용: 전체 상태 (클라이언트로 보내지 않는다) */
  get snapshot(): HoldemState {
    if (!this.state) throw new Error('게임이 아직 시작되지 않았습니다');
    return this.state;
  }

  getState(playerId: string | null): HoldemView {
    return getHoldemView(this.snapshot, playerId);
  }

  applyAction(playerId: string, action: HoldemAction): void {
    this.state = applyHoldemAction(this.snapshot, playerId, action);
  }

  getLegalActions(playerId: string): HoldemLegalAction[] {
    return getHoldemLegalActions(this.snapshot, playerId);
  }

  isFinished(): boolean {
    return this.snapshot.phase === 'finished';
  }

  getResult(): HoldemResult | null {
    return this.snapshot.result;
  }
}
