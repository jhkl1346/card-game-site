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
  DEFAULT_STUD7_RULES,
  STUD7_RAISE_ACTIONS,
  suitStrength,
  type Stud7ActionType,
  type Stud7Rules,
} from './rules.js';

export const STUD7_MIN_PLAYERS = 2;
export const STUD7_MAX_PLAYERS = 5;
export const STUD7_LAST_STREET = 7;

export interface Stud7Options {
  /** 매 판 모두가 내는 기본 판돈 */
  ante: number;
  /** 삥 금액이자 금액 내림 단위 (기본값 = ante) */
  betUnit?: number;
  rules?: Partial<Stud7Rules>;
  /** 셔플용 난수 함수. 서버에서는 crypto.randomInt를 넣는다. */
  randomInt?: RandomInt;
  /** 테스트 전용: 미리 순서를 정한 덱. 실제 게임에서는 절대 쓰지 않는다. */
  stackedDeck?: readonly Card[];
}

export interface Stud7Action {
  type: Stud7ActionType;
}

export interface Stud7LegalAction {
  type: Stud7ActionType;
  /** 이 액션으로 더 내는 칩 */
  amount: number;
  /** 이 액션으로 남은 칩을 모두 내게 되는지 */
  allIn: boolean;
}

export interface Stud7SeatCard {
  card: Card;
  open: boolean;
}

export interface Stud7PlayerState {
  id: string;
  name: string;
  isBot: boolean;
  startChips: number;
  stack: number;
  cards: Stud7SeatCard[];
  folded: boolean;
  allIn: boolean;
  /** 이번 라운드에 낸 금액 */
  roundBet: number;
  /** 이번 판에 낸 총 금액 (앤티 포함) */
  totalBet: number;
  raisesThisRound: number;
  acted: boolean;
  /** 짧은 올인으로 레이즈 권리가 다시 열리지 않은 경우 false */
  canRaise: boolean;
}

export interface Stud7LogEntry {
  street: number;
  playerId: string;
  action: Stud7ActionType | 'ante';
  amount: number;
  allIn: boolean;
}

export interface Stud7PotResult {
  amount: number;
  eligible: string[];
  winners: string[];
  shares: Record<string, number>;
}

export interface Stud7ShownHand {
  category: HandCategory;
  name: string;
  cards: Card[];
}

export interface Stud7Result extends GameResultBase {
  reason: 'fold' | 'showdown';
  pots: Stud7PotResult[];
  /** 쇼다운까지 간 사람의 최종 족보 (다이로 끝나면 비어 있음) */
  hands: Record<string, Stud7ShownHand>;
  winners: string[];
}

export interface Stud7State {
  readonly rules: Stud7Rules;
  readonly ante: number;
  readonly betUnit: number;
  readonly players: Stud7PlayerState[];
  /** 남은 덱 (서버 전용, 클라이언트에 절대 보내지 않음) */
  readonly deck: Card[];
  readonly street: number;
  readonly phase: 'betting' | 'finished';
  readonly currentBet: number;
  /** 직전 베팅/레이즈의 증가분 (따당 금액, 최소 레이즈 판단에 사용) */
  readonly lastRaiseSize: number;
  /** 현재 차례인 자리 번호, 없으면 -1 */
  readonly toAct: number;
  /** 첫 라운드를 시작한 자리 (홀수 칩 순서 기준) */
  readonly firstStarter: number;
  readonly log: Stud7LogEntry[];
  readonly result: Stud7Result | null;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type Draft = Mutable<Stud7State>;

function clone(state: Stud7State): Draft {
  return {
    ...state,
    players: state.players.map((p) => ({ ...p, cards: p.cards.slice() })),
    deck: state.deck.slice(),
    log: state.log.slice(),
  };
}


const potTotal = (s: Stud7State) => s.players.reduce((sum, p) => sum + p.totalBet, 0);
const canAct = (p: Stud7PlayerState) => !p.folded && !p.allIn;
const alivePlayers = (s: Stud7State) => s.players.filter((p) => !p.folded);

function put(s: Draft, p: Stud7PlayerState, amount: number): number {
  const paid = Math.min(amount, p.stack);
  p.stack -= paid;
  p.roundBet += paid;
  p.totalBet += paid;
  if (p.stack === 0) p.allIn = true;
  return paid;
}

function dealCard(s: Draft, p: Stud7PlayerState, open: boolean): void {
  const card = s.deck.shift();
  if (!card) throw new Error('덱에 카드가 부족합니다');
  p.cards.push({ card, open });
}

/** 공개 카드 한 장 비교값 (숫자 → 무늬) */
function openCardValue(rules: Stud7Rules, card: Card): number {
  return card.rank * 10 + suitStrength(rules, card.suit);
}

/** 공개 카드 패 비교값 (족보 점수 → 대표 카드 무늬) */
function openHandValue(rules: Stud7Rules, p: Stud7PlayerState): number {
  const open = p.cards.filter((c) => c.open).map((c) => c.card);
  if (open.length === 0) return -1;
  const hand = evaluateHand(open);
  const lead = hand.cards[0] as Card;
  return hand.score * 10 + suitStrength(rules, lead.suit);
}

function findStarter(s: Draft): number {
  const candidates = s.players.map((p, i) => ({ p, i })).filter(({ p }) => !p.folded);
  let best = candidates[0];
  if (!best) return -1;
  for (const c of candidates.slice(1)) {
    let better: boolean;
    if (s.street === 3) {
      const a = openCardValue(s.rules, c.p.cards[2]!.card);
      const b = openCardValue(s.rules, best.p.cards[2]!.card);
      better = s.rules.firstRoundStarter === 'lowestOpenCard' ? a < b : a > b;
    } else {
      better = openHandValue(s.rules, c.p) > openHandValue(s.rules, best.p);
    }
    if (better) best = c;
  }
  // 시작할 사람이 올인 상태면 그다음 자리부터 액션할 수 있는 사람을 찾는다
  const n = s.players.length;
  for (let k = 0; k < n; k++) {
    const i = (best.i + k) % n;
    if (canAct(s.players[i]!)) return i;
  }
  return -1;
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

function startBettingRound(s: Draft): void {
  for (const p of s.players) {
    p.roundBet = 0;
    p.raisesThisRound = 0;
    p.acted = false;
    p.canRaise = true;
  }
  s.currentBet = 0;
  s.lastRaiseSize = 0;

  if (s.players.filter(canAct).length <= 1) {
    runOutAndShowdown(s);
    return;
  }
  s.toAct = findStarter(s);
  if (s.street === 3) s.firstStarter = s.toAct;
}

function dealNextStreet(s: Draft): void {
  s.street += 1;
  const open = s.street < STUD7_LAST_STREET; // 7번째 카드는 비공개
  for (const p of s.players) {
    if (!p.folded) dealCard(s, p, open);
  }
}

function runOutAndShowdown(s: Draft): void {
  while (s.street < STUD7_LAST_STREET) dealNextStreet(s);
  showdown(s);
}

/** 홀수 칩·무늬 비교에서 쓰는 자리 순서 (첫 라운드 시작한 사람부터) */
function seatOrderFromStarter(s: Draft): string[] {
  const n = s.players.length;
  const start = s.firstStarter >= 0 ? s.firstStarter : 0;
  return Array.from({ length: n }, (_, k) => s.players[(start + k) % n]!.id);
}

function compareBySuit(rules: Stud7Rules, a: HandRank, b: HandRank): number {
  for (let i = 0; i < Math.min(a.cards.length, b.cards.length); i++) {
    const diff = suitStrength(rules, a.cards[i]!.suit) - suitStrength(rules, b.cards[i]!.suit);
    if (diff !== 0) return diff;
  }
  return 0;
}

function finish(s: Draft, reason: Stud7Result['reason'], pots: Stud7PotResult[], hands: Record<string, Stud7ShownHand>): void {
  const chipDeltas: Record<string, number> = {};
  const finalChips: Record<string, number> = {};
  for (const p of s.players) {
    chipDeltas[p.id] = p.stack - p.startChips;
    finalChips[p.id] = p.stack;
  }
  const winners = [...new Set(pots.flatMap((pot) => pot.winners))];
  s.phase = 'finished';
  s.toAct = -1;
  s.result = { reason, pots, hands, winners, chipDeltas, finalChips };
}

function finishByFold(s: Draft): void {
  const winner = alivePlayers(s)[0]!;
  const amount = potTotal(s);
  winner.stack += amount;
  finish(s, 'fold', [{ amount, eligible: [winner.id], winners: [winner.id], shares: { [winner.id]: amount } }], {});
}

function showdown(s: Draft): void {
  const ranks = new Map<string, HandRank>();
  const hands: Record<string, Stud7ShownHand> = {};
  for (const p of alivePlayers(s)) {
    const rank = evaluateHand(p.cards.map((c) => c.card));
    ranks.set(p.id, rank);
    hands[p.id] = { category: rank.category, name: rank.name, cards: rank.cards };
  }
  const order = seatOrderFromStarter(s);
  const pots = computePots(s.players.map((p) => ({ id: p.id, amount: p.totalBet, folded: p.folded })));
  const results: Stud7PotResult[] = pots.map((pot) => {
    let winners: string[] = [];
    let best: HandRank | null = null;
    for (const id of pot.eligible) {
      const rank = ranks.get(id)!;
      let cmp = best ? rank.score - best.score : 1;
      if (cmp === 0 && s.rules.tieBreakBySuit && best) cmp = compareBySuit(s.rules, rank, best);
      if (cmp > 0) {
        best = rank;
        winners = [id];
      } else if (cmp === 0) {
        winners.push(id);
      }
    }
    winners.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const shares = splitPot(pot.amount, winners);
    for (const [id, share] of Object.entries(shares)) {
      s.players.find((p) => p.id === id)!.stack += share;
    }
    return { amount: pot.amount, eligible: pot.eligible, winners, shares };
  });
  finish(s, 'showdown', results, hands);
}

function legalActionsAt(s: Stud7State, index: number): Stud7LegalAction[] {
  if (s.phase !== 'betting' || s.toAct !== index) return [];
  const p = s.players[index]!;
  const toCall = s.currentBet - p.roundBet;
  const actions: Stud7LegalAction[] = [];
  const capped = (type: Stud7ActionType, amount: number) =>
    actions.push({ type, amount: Math.min(amount, p.stack), allIn: amount >= p.stack });

  if (toCall === 0) actions.push({ type: 'check', amount: 0, allIn: false });
  else capped('call', toCall);

  if (s.currentBet === 0 && p.stack > 0) capped('bbing', s.betUnit);

  const othersCanRespond = s.players.some((o, i) => i !== index && canAct(o));
  const raiseAllowed =
    p.canRaise &&
    othersCanRespond &&
    p.stack > toCall &&
    (s.rules.maxRaisesPerRound === null || p.raisesThisRound < s.rules.maxRaisesPerRound);

  if (raiseAllowed) {
    if (s.currentBet > 0) capped('ddadang', toCall + Math.max(s.lastRaiseSize, s.betUnit));
    const pot = potTotal(s) + (s.rules.potBetBase === 'afterCall' ? toCall : 0);
    const ratios: Array<[Stud7ActionType, number]> = [['quarter', 0.25], ['half', 0.5]];
    if (s.rules.maxBetAction === 'full') ratios.push(['full', 1]);
    for (const [type, ratio] of ratios) {
      const raise = Math.max(Math.floor((pot * ratio) / s.betUnit) * s.betUnit, s.betUnit);
      capped(type, toCall + raise);
    }
  }

  actions.push({ type: 'die', amount: 0, allIn: false });

  if (s.street === 3) {
    return actions.filter((a) => s.rules.firstRoundActions.includes(a.type));
  }
  return actions;
}

// ───────────────────────── 공개 함수 (순수 함수) ─────────────────────────

export function createStud7(players: readonly PlayerInit[], options: Stud7Options): Stud7State {
  if (players.length < STUD7_MIN_PLAYERS || players.length > STUD7_MAX_PLAYERS) {
    throw new GameRuleError(`7포커는 ${STUD7_MIN_PLAYERS}~${STUD7_MAX_PLAYERS}명이 할 수 있습니다`);
  }
  if (new Set(players.map((p) => p.id)).size !== players.length) {
    throw new GameRuleError('같은 참가자가 두 번 들어 있습니다');
  }
  if (!Number.isInteger(options.ante) || options.ante < 1) {
    throw new GameRuleError('판돈은 1 이상의 정수여야 합니다');
  }
  for (const p of players) {
    if (!Number.isInteger(p.chips) || p.chips < 1) {
      throw new GameRuleError(`${p.name}님의 칩이 부족합니다`);
    }
  }
  const betUnit = options.betUnit ?? options.ante;
  if (!Number.isInteger(betUnit) || betUnit < 1) {
    throw new GameRuleError('베팅 단위는 1 이상의 정수여야 합니다');
  }

  let deck: Card[];
  if (options.stackedDeck) deck = options.stackedDeck.slice();
  else if (options.randomInt) deck = shuffle(createDeck(), options.randomInt);
  else throw new Error('셔플용 난수 함수(randomInt)가 필요합니다');

  const s: Draft = {
    rules: { ...DEFAULT_STUD7_RULES, ...options.rules },
    ante: options.ante,
    betUnit,
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot ?? false,
      startChips: p.chips,
      stack: p.chips,
      cards: [],
      folded: false,
      allIn: false,
      roundBet: 0,
      totalBet: 0,
      raisesThisRound: 0,
      acted: false,
      canRaise: true,
    })),
    deck,
    street: 3,
    phase: 'betting',
    currentBet: 0,
    lastRaiseSize: 0,
    toAct: -1,
    firstStarter: -1,
    log: [],
    result: null,
  };

  for (const p of s.players) {
    const paid = put(s, p, s.ante);
    s.log.push({ street: 3, playerId: p.id, action: 'ante', amount: paid, allIn: p.allIn });
  }
  // 앤티는 라운드 베팅이 아니므로 roundBet에서 뺀다
  for (const p of s.players) p.roundBet = 0;

  // 첫 3장: 비공개 2장 → 공개 1장, 한 장씩 돌아가며 나눈다
  for (const open of [false, false, true]) {
    for (const p of s.players) dealCard(s, p, open);
  }
  startBettingRound(s);
  return s;
}

export function getStud7LegalActions(state: Stud7State, playerId: string): Stud7LegalAction[] {
  const index = state.players.findIndex((p) => p.id === playerId);
  return index < 0 ? [] : legalActionsAt(state, index);
}

export function applyStud7Action(state: Stud7State, playerId: string, action: Stud7Action): Stud7State {
  if (state.phase === 'finished') throw new GameRuleError('이미 끝난 판입니다');
  const index = state.players.findIndex((p) => p.id === playerId);
  if (index < 0) throw new GameRuleError('이 판의 참가자가 아닙니다');
  if (state.toAct !== index) throw new GameRuleError('내 차례가 아닙니다');
  const legal = legalActionsAt(state, index).find((a) => a.type === action.type);
  if (!legal) throw new GameRuleError('지금은 할 수 없는 액션입니다');

  const s = clone(state);
  const p = s.players[index]!;
  const paid = legal.amount > 0 ? put(s, p, legal.amount) : 0;
  p.acted = true;
  if (action.type === 'die') p.folded = true;

  const increment = p.roundBet - s.currentBet;
  if (increment > 0) {
    const fullRaise = s.currentBet === 0 || increment >= s.lastRaiseSize;
    if (STUD7_RAISE_ACTIONS.includes(action.type)) p.raisesThisRound += 1;
    for (const o of s.players) {
      if (o === p || !canAct(o)) continue;
      // 짧은 올인은 이미 액션한 사람에게 레이즈 권리를 다시 주지 않는다
      if (!fullRaise && o.acted) o.canRaise = false;
      if (fullRaise) o.canRaise = true;
      o.acted = false;
    }
    if (fullRaise) s.lastRaiseSize = increment;
    s.currentBet = p.roundBet;
  }
  s.log.push({ street: s.street, playerId: p.id, action: action.type, amount: paid, allIn: p.allIn });

  if (alivePlayers(s).length === 1) {
    finishByFold(s);
    return s;
  }

  const next = nextToAct(s, index);
  if (next >= 0) {
    s.toAct = next;
  } else if (s.street === STUD7_LAST_STREET) {
    showdown(s);
  } else {
    dealNextStreet(s);
    startBettingRound(s);
  }
  return s;
}

/** 턴 시간이 지났을 때의 자동 액션: 체크할 수 있으면 체크, 아니면 다이 */
export function stud7TimeoutAction(state: Stud7State, playerId: string): Stud7Action {
  const legal = getStud7LegalActions(state, playerId);
  return { type: legal.some((a) => a.type === 'check') ? 'check' : 'die' };
}

// ───────────────────────── 플레이어 시야 ─────────────────────────

export interface Stud7PlayerView {
  id: string;
  name: string;
  isBot: boolean;
  stack: number;
  folded: boolean;
  allIn: boolean;
  roundBet: number;
  totalBet: number;
  /** 볼 수 없는 카드는 null */
  cards: Array<Card | null>;
}

export interface Stud7View {
  gameType: 'stud7';
  /** 이 시야의 주인 (관전자는 null) */
  myId: string | null;
  rules: Stud7Rules;
  ante: number;
  betUnit: number;
  street: number;
  phase: Stud7State['phase'];
  pot: number;
  currentBet: number;
  toActId: string | null;
  /** 남은 덱은 장수만 */
  deckCount: number;
  players: Stud7PlayerView[];
  legalActions: Stud7LegalAction[];
  log: Stud7LogEntry[];
  result: Stud7Result | null;
}

/**
 * playerId가 봐도 되는 정보만 담은 시야를 만든다.
 * - 남의 비공개 카드는 null, 남은 덱은 장수만.
 * - 판이 쇼다운으로 끝났으면 쇼다운까지 간 사람의 카드를 공개한다.
 */
export function getStud7View(state: Stud7State, playerId: string | null): Stud7View {
  const revealAll = state.phase === 'finished' && state.result?.reason === 'showdown';
  const me = state.players.find((p) => p.id === playerId) ?? null;
  return {
    gameType: 'stud7',
    myId: me ? me.id : null,
    rules: { ...state.rules },
    ante: state.ante,
    betUnit: state.betUnit,
    street: state.street,
    phase: state.phase,
    pot: potTotal(state),
    currentBet: state.currentBet,
    toActId: state.toAct >= 0 ? state.players[state.toAct]!.id : null,
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
      cards: p.cards.map(({ card, open }) =>
        open || p === me || (revealAll && !p.folded) ? { ...card } : null,
      ),
    })),
    legalActions: me ? getStud7LegalActions(state, me.id) : [],
    log: state.log.map((e) => ({ ...e })),
    result: state.result,
  };
}

// ───────────────────────── GameEngine 구현 ─────────────────────────

export class Stud7Engine
  implements GameEngine<Stud7Options, Stud7Action, Stud7View, Stud7Result, Stud7LegalAction>
{
  private state: Stud7State | null = null;

  init(players: readonly PlayerInit[], options: Stud7Options): void {
    this.state = createStud7(players, options);
  }

  /** 서버 내부 전용: 전체 상태 (클라이언트로 보내지 않는다) */
  get snapshot(): Stud7State {
    if (!this.state) throw new Error('게임이 아직 시작되지 않았습니다');
    return this.state;
  }

  getState(playerId: string | null): Stud7View {
    return getStud7View(this.snapshot, playerId);
  }

  applyAction(playerId: string, action: Stud7Action): void {
    this.state = applyStud7Action(this.snapshot, playerId, action);
  }

  getLegalActions(playerId: string): Stud7LegalAction[] {
    return getStud7LegalActions(this.snapshot, playerId);
  }

  isFinished(): boolean {
    return this.snapshot.phase === 'finished';
  }

  getResult(): Stud7Result | null {
    return this.snapshot.result;
  }
}
