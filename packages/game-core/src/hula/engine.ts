import { shuffle, type RandomInt } from '../cards/deck.js';
import {
  GameRuleError,
  type GameEngine,
  type GameResultBase,
  type PlayerInit,
} from '../engine/types.js';
import {
  classifyMeld,
  createHulaDeck,
  findMelds,
  handPoints,
  hulaCardId,
  hulaCardPoints,
  type HulaCard,
  type MeldKind,
} from './meld.js';
import { DEFAULT_HULA_RULES, type HulaActionType, type HulaRules } from './rules.js';

export const HULA_MIN_PLAYERS = 2;
export const HULA_MAX_PLAYERS = 4;
export const HULA_HAND_SIZE = 7;

export interface HulaOptions {
  /** 점당 칩 (settlement='points') */
  pointValue: number;
  /** 고정 판돈 (settlement='fixed'일 때만 사용) */
  fixedStake?: number;
  /** 딜러 자리 (기본 0). 첫 차례는 딜러 다음 자리 */
  dealerIndex?: number;
  rules?: Partial<HulaRules>;
  /** 셔플용 난수 함수. 서버에서는 crypto.randomInt를 넣는다. */
  randomInt?: RandomInt;
  /** 테스트 전용: 미리 순서를 정한 덱. 실제 게임에서는 절대 쓰지 않는다. */
  stackedDeck?: readonly HulaCard[];
}

export type HulaAction =
  | { type: 'drawDeck' }
  | { type: 'drawDiscard' }
  | { type: 'stop' }
  | { type: 'meld'; cards: string[] }
  | { type: 'layoff'; meldId: number; cards: string[] }
  | { type: 'discard'; card: string };

export interface HulaMeld {
  id: number;
  owner: string;
  kind: MeldKind;
  cards: HulaCard[];
}

export interface HulaPlayerState {
  id: string;
  name: string;
  isBot: boolean;
  startChips: number;
  stack: number;
  hand: HulaCard[];
  /** 이 판에 한 번이라도 등록했는지 */
  hasMelded: boolean;
  /** 이번 턴이 시작될 때 이미 등록한 적이 있었는지 (훌라 보너스 판정) */
  meldedBeforeTurn: boolean;
}

export interface HulaLogEntry {
  playerId: string;
  action: HulaActionType;
  /** 모두에게 공개되는 카드만 (덱에서 가져온 카드는 기록하지 않음) */
  cards: string[];
  meldId?: number;
}

export type HulaEndReason = 'out' | 'hula' | 'exhausted' | 'stop' | 'stopFailed';

export interface HulaResult extends GameResultBase {
  reason: HulaEndReason;
  winner: string;
  /** 스톱을 선언한 사람 */
  declarer: string | null;
  /** 판이 끝났을 때 각자 손에 남은 카드 점수 */
  points: Record<string, number>;
  /** 각자 승자에게 낸 칩 */
  payments: Record<string, number>;
  /** 판이 끝난 뒤 공개되는 손패 */
  hands: Record<string, HulaCard[]>;
}

export interface HulaState {
  readonly rules: HulaRules;
  readonly pointValue: number;
  readonly fixedStake: number;
  readonly dealer: number;
  readonly players: HulaPlayerState[];
  /** 남은 덱 (서버 전용) */
  readonly deck: HulaCard[];
  /** 버린 더미 (공개 정보, 마지막이 맨 위) */
  readonly discardPile: HulaCard[];
  readonly melds: HulaMeld[];
  readonly nextMeldId: number;
  readonly turn: number;
  readonly phase: 'draw' | 'play' | 'finished';
  /** 버린 더미에서 가져와 이번 턴에 반드시 써야 하는 카드 */
  readonly mustUse: string | null;
  readonly log: HulaLogEntry[];
  readonly result: HulaResult | null;
}

type Draft = { -readonly [K in keyof HulaState]: HulaState[K] };

function clone(state: HulaState): Draft {
  return {
    ...state,
    players: state.players.map((p) => ({ ...p, hand: p.hand.slice() })),
    deck: state.deck.slice(),
    discardPile: state.discardPile.slice(),
    melds: state.melds.map((m) => ({ ...m, cards: m.cards.slice() })),
    log: state.log.slice(),
  };
}

/** 손패에서 카드 id들을 찾아 인덱스로. 없거나 중복이면 null */
function resolve(hand: readonly HulaCard[], ids: readonly string[]): number[] | null {
  const used = new Set<number>();
  for (const id of ids) {
    const index = hand.findIndex((c, i) => !used.has(i) && hulaCardId(c) === id);
    if (index < 0) return null;
    used.add(index);
  }
  return ids.length > 0 ? [...used] : null;
}

function removeIndices(hand: HulaCard[], indices: readonly number[]): HulaCard[] {
  const taken = indices.map((i) => hand[i]!);
  const keep = hand.filter((_, i) => !indices.includes(i));
  hand.length = 0;
  hand.push(...keep);
  return taken;
}

function canLayOffTo(s: HulaState, playerId: string, meld: HulaMeld): boolean {
  if (s.rules.layOffRequiresMeld && !s.players.find((p) => p.id === playerId)?.hasMelded) return false;
  return s.rules.layOffToOthers || meld.owner === playerId;
}

/** 버린 카드를 지금 손패로 바로 멜드나 붙여놓기에 쓸 수 있는지 */
function canUseCard(s: HulaState, playerId: string, card: HulaCard): boolean {
  const hand = [...s.players.find((p) => p.id === playerId)!.hand, card];
  const last = hand.length - 1;
  if (findMelds(hand, s.rules).some((m) => m.includes(last))) return true;
  return s.melds.some((m) => canLayOffTo(s, playerId, m) && classifyMeld([...m.cards, card], s.rules, false) !== null);
}

function orderFromDealer(s: HulaState): string[] {
  const n = s.players.length;
  return Array.from({ length: n }, (_, k) => s.players[(s.dealer + 1 + k) % n]!.id);
}

function finish(s: Draft, reason: HulaEndReason, winnerId: string, declarer: string | null): void {
  const points: Record<string, number> = {};
  const payments: Record<string, number> = {};
  const hands: Record<string, HulaCard[]> = {};
  for (const p of s.players) {
    points[p.id] = handPoints(p.hand, s.rules);
    hands[p.id] = p.hand.slice();
  }
  const winner = s.players.find((p) => p.id === winnerId)!;
  for (const p of s.players) {
    if (p === winner) {
      payments[p.id] = 0;
      continue;
    }
    const base = s.rules.settlement === 'points' ? points[p.id]! * s.pointValue : s.fixedStake;
    let multiplier = 1;
    if (reason === 'hula') multiplier *= s.rules.hulaMultiplier;
    if (reason === 'stopFailed' && p.id === declarer) multiplier *= s.rules.stopFailMultiplier;
    const pay = Math.min(p.stack, base * multiplier);
    p.stack -= pay;
    winner.stack += pay;
    payments[p.id] = pay;
  }
  const chipDeltas: Record<string, number> = {};
  const finalChips: Record<string, number> = {};
  for (const p of s.players) {
    chipDeltas[p.id] = p.stack - p.startChips;
    finalChips[p.id] = p.stack;
  }
  s.phase = 'finished';
  s.mustUse = null;
  s.result = { reason, winner: winnerId, declarer, points, payments, hands, chipDeltas, finalChips };
}

/** 점수가 가장 낮은 사람 (같으면 딜러 다음 자리에서 가까운 사람) */
function lowest(s: Draft, candidates: readonly string[]): string {
  const order = orderFromDealer(s);
  const pts = (id: string) => handPoints(s.players.find((p) => p.id === id)!.hand, s.rules);
  return [...candidates].sort((a, b) => pts(a) - pts(b) || order.indexOf(a) - order.indexOf(b))[0]!;
}

function startTurn(s: Draft, index: number): void {
  s.turn = index;
  s.mustUse = null;
  if (s.deck.length === 0) {
    finish(s, 'exhausted', lowest(s, s.players.map((p) => p.id)), null);
    return;
  }
  const p = s.players[index]!;
  p.meldedBeforeTurn = p.hasMelded;
  s.phase = 'draw';
}

function winByEmptyHand(s: Draft, p: HulaPlayerState): void {
  finish(s, p.meldedBeforeTurn ? 'out' : 'hula', p.id, null);
}

// ───────────────────────── 공개 함수 (순수 함수) ─────────────────────────

export function createHula(players: readonly PlayerInit[], options: HulaOptions): HulaState {
  const n = players.length;
  if (n < HULA_MIN_PLAYERS || n > HULA_MAX_PLAYERS) {
    throw new GameRuleError(`훌라는 ${HULA_MIN_PLAYERS}~${HULA_MAX_PLAYERS}명이 할 수 있습니다`);
  }
  if (new Set(players.map((p) => p.id)).size !== n) throw new GameRuleError('같은 참가자가 두 번 들어 있습니다');
  if (!Number.isInteger(options.pointValue) || options.pointValue < 1) {
    throw new GameRuleError('점당 칩은 1 이상의 정수여야 합니다');
  }
  for (const p of players) {
    if (!Number.isInteger(p.chips) || p.chips < 1) throw new GameRuleError(`${p.name}님의 칩이 부족합니다`);
  }
  const rules: HulaRules = { ...DEFAULT_HULA_RULES, ...options.rules };
  const fixedStake = options.fixedStake ?? options.pointValue;
  const dealer = options.dealerIndex ?? 0;
  if (!Number.isInteger(dealer) || dealer < 0 || dealer >= n) throw new GameRuleError('딜러 위치가 올바르지 않습니다');

  let deck: HulaCard[];
  if (options.stackedDeck) deck = options.stackedDeck.slice();
  else if (options.randomInt) deck = shuffle(createHulaDeck(rules.jokers), options.randomInt);
  else throw new Error('셔플용 난수 함수(randomInt)가 필요합니다');

  const s: Draft = {
    rules,
    pointValue: options.pointValue,
    fixedStake,
    dealer,
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot ?? false,
      startChips: p.chips,
      stack: p.chips,
      hand: [],
      hasMelded: false,
      meldedBeforeTurn: false,
    })),
    deck,
    discardPile: [],
    melds: [],
    nextMeldId: 1,
    turn: -1,
    phase: 'draw',
    mustUse: null,
    log: [],
    result: null,
  };

  const take = () => {
    const card = s.deck.shift();
    if (!card) throw new Error('덱에 카드가 부족합니다');
    return card;
  };
  for (let round = 0; round < HULA_HAND_SIZE; round++) {
    for (let k = 1; k <= n; k++) s.players[(dealer + k) % n]!.hand.push(take());
  }
  s.discardPile.push(take());
  startTurn(s, (dealer + 1) % n);
  return s;
}

export type HulaLegalAction = HulaAction;

export function getHulaLegalActions(state: HulaState, playerId: string): HulaLegalAction[] {
  if (state.phase === 'finished') return [];
  const index = state.players.findIndex((p) => p.id === playerId);
  if (index < 0 || index !== state.turn) return [];
  const p = state.players[index]!;
  const actions: HulaLegalAction[] = [];

  if (state.phase === 'draw') {
    actions.push({ type: 'drawDeck' });
    const top = state.discardPile[state.discardPile.length - 1];
    if (top && (state.rules.discardPickup === 'free' || canUseCard(state, playerId, top))) {
      actions.push({ type: 'drawDiscard' });
    }
    if (state.rules.stopEnabled && handPoints(p.hand, state.rules) <= state.rules.stopMaxPoints) {
      actions.push({ type: 'stop' });
    }
    return actions;
  }

  const ids = p.hand.map(hulaCardId);
  const mustUse = state.mustUse;
  for (const meld of findMelds(p.hand, state.rules)) {
    const cards = meld.map((i) => ids[i]!);
    if (!mustUse || cards.includes(mustUse)) actions.push({ type: 'meld', cards });
  }
  for (const meld of state.melds) {
    if (!canLayOffTo(state, playerId, meld)) continue;
    p.hand.forEach((card, i) => {
      const id = ids[i]!;
      if (mustUse && id !== mustUse) return;
      if (classifyMeld([...meld.cards, card], state.rules, false)) {
        actions.push({ type: 'layoff', meldId: meld.id, cards: [id] });
      }
    });
  }
  if (!mustUse) {
    for (const id of new Set(ids)) actions.push({ type: 'discard', card: id });
  }
  return actions;
}

export function applyHulaAction(state: HulaState, playerId: string, action: HulaAction): HulaState {
  if (state.phase === 'finished') throw new GameRuleError('이미 끝난 판입니다');
  const index = state.players.findIndex((p) => p.id === playerId);
  if (index < 0) throw new GameRuleError('이 판의 참가자가 아닙니다');
  if (state.turn !== index) throw new GameRuleError('내 차례가 아닙니다');

  const drawPhase = state.phase === 'draw';
  const isDrawAction = action.type === 'drawDeck' || action.type === 'drawDiscard' || action.type === 'stop';
  if (drawPhase !== isDrawAction) {
    throw new GameRuleError(drawPhase ? '먼저 카드를 가져와야 합니다' : '이미 카드를 가져왔습니다');
  }

  const s = clone(state);
  const p = s.players[index]!;

  switch (action.type) {
    case 'drawDeck': {
      p.hand.push(s.deck.shift()!);
      s.phase = 'play';
      s.log.push({ playerId, action: 'drawDeck', cards: [] });
      break;
    }
    case 'drawDiscard': {
      const top = s.discardPile[s.discardPile.length - 1];
      if (!top) throw new GameRuleError('버린 카드가 없습니다');
      if (s.rules.discardPickup === 'mustUse' && !canUseCard(s, playerId, top)) {
        throw new GameRuleError('버린 카드는 바로 등록하거나 붙일 수 있을 때만 가져올 수 있습니다');
      }
      s.discardPile.pop();
      p.hand.push(top);
      s.phase = 'play';
      if (s.rules.discardPickup === 'mustUse') s.mustUse = hulaCardId(top);
      s.log.push({ playerId, action: 'drawDiscard', cards: [hulaCardId(top)] });
      break;
    }
    case 'stop': {
      if (!s.rules.stopEnabled) throw new GameRuleError('스톱을 사용하지 않는 방입니다');
      const mine = handPoints(p.hand, s.rules);
      if (mine > s.rules.stopMaxPoints) {
        throw new GameRuleError(`손패 점수가 ${s.rules.stopMaxPoints}점 이하일 때만 스톱할 수 있습니다`);
      }
      s.log.push({ playerId, action: 'stop', cards: [] });
      const others = s.players.filter((o) => o !== p);
      const success = others.every((o) => handPoints(o.hand, s.rules) >= mine);
      if (success) finish(s, 'stop', playerId, playerId);
      else finish(s, 'stopFailed', lowest(s, others.map((o) => o.id)), playerId);
      return s;
    }
    case 'meld': {
      const indices = resolve(p.hand, action.cards);
      if (!indices) throw new GameRuleError('손에 없는 카드입니다');
      const cards = indices.map((i) => p.hand[i]!);
      const kind = classifyMeld(cards, s.rules, true);
      if (!kind) throw new GameRuleError('등록할 수 없는 조합입니다');
      if (s.mustUse && !action.cards.includes(s.mustUse)) {
        throw new GameRuleError('버린 더미에서 가져온 카드를 먼저 써야 합니다');
      }
      removeIndices(p.hand, indices);
      const meldId = s.nextMeldId++;
      s.melds.push({ id: meldId, owner: playerId, kind, cards });
      p.hasMelded = true;
      if (s.mustUse && action.cards.includes(s.mustUse)) s.mustUse = null;
      s.log.push({ playerId, action: 'meld', cards: action.cards.slice(), meldId });
      if (p.hand.length === 0) winByEmptyHand(s, p);
      return s;
    }
    case 'layoff': {
      const meld = s.melds.find((m) => m.id === action.meldId);
      if (!meld) throw new GameRuleError('없는 멜드입니다');
      if (!canLayOffTo(s, playerId, meld)) {
        throw new GameRuleError(s.rules.layOffRequiresMeld && !p.hasMelded ? '먼저 내 카드를 등록해야 붙일 수 있습니다' : '다른 사람의 멜드에는 붙일 수 없습니다');
      }
      const indices = resolve(p.hand, action.cards);
      if (!indices) throw new GameRuleError('손에 없는 카드입니다');
      const combined = [...meld.cards, ...indices.map((i) => p.hand[i]!)];
      const kind = classifyMeld(combined, s.rules, false);
      if (!kind) throw new GameRuleError('이 멜드에는 붙일 수 없는 카드입니다');
      if (s.mustUse && !action.cards.includes(s.mustUse)) {
        throw new GameRuleError('버린 더미에서 가져온 카드를 먼저 써야 합니다');
      }
      removeIndices(p.hand, indices);
      meld.cards = combined;
      meld.kind = kind;
      p.hasMelded = true;
      if (s.mustUse && action.cards.includes(s.mustUse)) s.mustUse = null;
      s.log.push({ playerId, action: 'layoff', cards: action.cards.slice(), meldId: meld.id });
      if (p.hand.length === 0) winByEmptyHand(s, p);
      return s;
    }
    case 'discard': {
      if (s.mustUse) throw new GameRuleError('버린 더미에서 가져온 카드를 먼저 써야 합니다');
      const indices = resolve(p.hand, [action.card]);
      if (!indices) throw new GameRuleError('손에 없는 카드입니다');
      const [card] = removeIndices(p.hand, indices);
      s.discardPile.push(card!);
      s.log.push({ playerId, action: 'discard', cards: [action.card] });
      if (p.hand.length === 0) {
        winByEmptyHand(s, p);
        return s;
      }
      startTurn(s, (index + 1) % s.players.length);
      return s;
    }
  }
  return s;
}

/**
 * 턴 시간 초과 시 다음 자동 액션 (서버는 차례가 넘어갈 때까지 반복 호출)
 * - 가져오기 전: 덱에서 가져오기
 * - 버린 카드를 써야 하면: 그 카드를 쓰는 첫 번째 등록/붙이기
 * - 그 밖: 점수가 가장 높은 카드 버리기
 */
export function hulaTimeoutAction(state: HulaState, playerId: string): HulaAction {
  const legal = getHulaLegalActions(state, playerId);
  if (state.phase === 'draw') return { type: 'drawDeck' };
  if (state.mustUse) return legal[0]!;
  const p = state.players.find((x) => x.id === playerId)!;
  const worst = [...p.hand].sort((a, b) => hulaCardPoints(b, state.rules) - hulaCardPoints(a, state.rules))[0]!;
  return { type: 'discard', card: hulaCardId(worst) };
}

// ───────────────────────── 플레이어 시야 ─────────────────────────

export interface HulaPlayerView {
  id: string;
  name: string;
  isBot: boolean;
  stack: number;
  /** 남의 손패는 장수만 */
  handCount: number;
  hasMelded: boolean;
}

export interface HulaView {
  gameType: 'hula';
  myId: string | null;
  rules: HulaRules;
  pointValue: number;
  dealerId: string;
  turnId: string | null;
  phase: HulaState['phase'];
  /** 내 손패 (관전자는 빈 배열) */
  myHand: HulaCard[];
  myPoints: number;
  players: HulaPlayerView[];
  melds: HulaMeld[];
  /** 버린 더미 전체 (모두가 본 카드라 공개 정보) */
  discardPile: HulaCard[];
  /** 남은 덱은 장수만 */
  deckCount: number;
  mustUse: string | null;
  legalActions: HulaLegalAction[];
  log: HulaLogEntry[];
  result: HulaResult | null;
}

export function getHulaView(state: HulaState, playerId: string | null): HulaView {
  const me = state.players.find((p) => p.id === playerId) ?? null;
  return {
    gameType: 'hula',
    myId: me ? me.id : null,
    rules: { ...state.rules },
    pointValue: state.pointValue,
    dealerId: state.players[state.dealer]!.id,
    turnId: state.phase === 'finished' ? null : state.players[state.turn]!.id,
    phase: state.phase,
    myHand: me ? me.hand.map((c) => ({ ...c })) : [],
    myPoints: me ? handPoints(me.hand, state.rules) : 0,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      stack: p.stack,
      handCount: p.hand.length,
      hasMelded: p.hasMelded,
    })),
    melds: state.melds.map((m) => ({ ...m, cards: m.cards.map((c) => ({ ...c })) })),
    discardPile: state.discardPile.map((c) => ({ ...c })),
    deckCount: state.deck.length,
    mustUse: me && state.players[state.turn] === me ? state.mustUse : null,
    legalActions: me ? getHulaLegalActions(state, me.id) : [],
    log: state.log.map((e) => ({ ...e, cards: e.cards.slice() })),
    result: state.result,
  };
}

// ───────────────────────── GameEngine 구현 ─────────────────────────

export class HulaEngine implements GameEngine<HulaOptions, HulaAction, HulaView, HulaResult, HulaLegalAction> {
  private state: HulaState | null = null;

  init(players: readonly PlayerInit[], options: HulaOptions): void {
    this.state = createHula(players, options);
  }

  /** 서버 내부 전용: 전체 상태 (클라이언트로 보내지 않는다) */
  get snapshot(): HulaState {
    if (!this.state) throw new Error('게임이 아직 시작되지 않았습니다');
    return this.state;
  }

  getState(playerId: string | null): HulaView {
    return getHulaView(this.snapshot, playerId);
  }

  applyAction(playerId: string, action: HulaAction): void {
    this.state = applyHulaAction(this.snapshot, playerId, action);
  }

  getLegalActions(playerId: string): HulaLegalAction[] {
    return getHulaLegalActions(this.snapshot, playerId);
  }

  isFinished(): boolean {
    return this.snapshot.phase === 'finished';
  }

  getResult(): HulaResult | null {
    return this.snapshot.result;
  }
}
