import { randomInt } from 'node:crypto';
import {
  applyHoldemAction,
  applyHulaAction,
  applyStud7Action,
  createHoldem,
  createHula,
  createStud7,
  decideHoldemAction,
  decideHulaAction,
  decideStud7Action,
  getHoldemView,
  getHulaView,
  getStud7View,
  HOLDEM_MAX_PLAYERS,
  HOLDEM_MIN_PLAYERS,
  holdemTimeoutAction,
  HULA_MAX_PLAYERS,
  HULA_MIN_PLAYERS,
  hulaTimeoutAction,
  STUD7_MAX_PLAYERS,
  STUD7_MIN_PLAYERS,
  stud7TimeoutAction,
  type BotRandom,
  type GameResultBase,
  type PlayerInit,
  type RandomInt,
} from '@card-game/game-core';
import { z } from 'zod';
import type { GameType } from '../db/schema.js';

/**
 * 세 게임 엔진을 방(GameRoom)이 같은 방식으로 다루도록 감싼 어댑터.
 * 상태(state)는 서버 메모리에만 있고, 클라이언트에는 view(시야)만 보낸다.
 */
export interface GameAdapter {
  type: GameType;
  nameKo: string;
  minPlayers: number;
  maxPlayers: number;
  /** stake 의미: 7포커 앤티, 홀덤 빅블라인드, 훌라 점당 칩 */
  stakeLabel: string;
  create(players: readonly PlayerInit[], stake: number, dealerIndex: number, random: RandomInt): unknown;
  /** 액션 모양만 검사한다. 규칙 검사는 엔진이 한다 */
  parseAction(raw: unknown): unknown;
  apply(state: unknown, playerId: string, action: unknown): unknown;
  view(state: unknown, playerId: string | null): { result: unknown } & Record<string, unknown>;
  toActId(state: unknown): string | null;
  timeoutAction(state: unknown, playerId: string): unknown;
  botAction(state: unknown, playerId: string, random: BotRandom): unknown;
  /** 봇이 오래 생각할 필요 없는 가벼운 차례인지 (7포커 공개 카드 고르기) */
  quickTurn?(state: unknown): boolean;
  result(state: unknown): GameResultBase | null;
}

const serverRandomInt: RandomInt = (max) => randomInt(max);
export { serverRandomInt };

const stud7ActionSchema = z.object({
  type: z.enum(['bbing', 'check', 'call', 'ddadang', 'quarter', 'half', 'full', 'die', 'open']),
  cardIndex: z.number().int().min(0).max(2).optional(),
});

const holdemActionSchema = z.object({
  type: z.enum(['fold', 'check', 'call', 'bet', 'raise', 'allin']),
  amount: z.number().int().nonnegative().max(1e12).optional(),
});

const cardId = z.string().max(4);
const hulaActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('drawDeck') }),
  z.object({ type: z.literal('drawDiscard') }),
  z.object({ type: z.literal('stop') }),
  z.object({ type: z.literal('meld'), cards: z.array(cardId).min(1).max(13) }),
  z.object({ type: z.literal('layoff'), meldId: z.number().int().nonnegative(), cards: z.array(cardId).min(1).max(13) }),
  z.object({ type: z.literal('discard'), card: cardId }),
]);

/* eslint-disable @typescript-eslint/no-explicit-any -- 어댑터 경계에서만 엔진별 타입을 지운다 */
export const ADAPTERS: Readonly<Record<GameType, GameAdapter>> = {
  stud7: {
    type: 'stud7',
    nameKo: '7포커',
    minPlayers: STUD7_MIN_PLAYERS,
    maxPlayers: STUD7_MAX_PLAYERS,
    stakeLabel: '앤티',
    create: (players, stake, _dealer, random) => createStud7(players, { ante: stake, randomInt: random }),
    parseAction: (raw) => stud7ActionSchema.parse(raw),
    apply: (s, id, a) => applyStud7Action(s as any, id, a as any),
    view: (s, id) => getStud7View(s as any, id) as any,
    toActId: (s) => getStud7View(s as any, null).toActId,
    timeoutAction: (s, id) => stud7TimeoutAction(s as any, id),
    botAction: (s, id, r) => decideStud7Action(getStud7View(s as any, id), r),
    quickTurn: (s) => (s as any).phase === 'choose',
    result: (s) => (s as any).result,
  },
  holdem: {
    type: 'holdem',
    nameKo: '텍사스 홀덤',
    minPlayers: HOLDEM_MIN_PLAYERS,
    maxPlayers: HOLDEM_MAX_PLAYERS,
    stakeLabel: '빅블라인드',
    create: (players, stake, dealer, random) =>
      createHoldem(players, { smallBlind: Math.max(1, Math.floor(stake / 2)), bigBlind: stake, buttonIndex: dealer, randomInt: random }),
    parseAction: (raw) => holdemActionSchema.parse(raw),
    apply: (s, id, a) => applyHoldemAction(s as any, id, a as any),
    view: (s, id) => getHoldemView(s as any, id) as any,
    toActId: (s) => getHoldemView(s as any, null).toActId,
    timeoutAction: (s, id) => holdemTimeoutAction(s as any, id),
    botAction: (s, id, r) => decideHoldemAction(getHoldemView(s as any, id), r),
    result: (s) => (s as any).result,
  },
  hula: {
    type: 'hula',
    nameKo: '훌라',
    minPlayers: HULA_MIN_PLAYERS,
    maxPlayers: HULA_MAX_PLAYERS,
    stakeLabel: '점당 칩',
    create: (players, stake, dealer, random) => createHula(players, { pointValue: stake, dealerIndex: dealer, randomInt: random }),
    parseAction: (raw) => hulaActionSchema.parse(raw),
    apply: (s, id, a) => applyHulaAction(s as any, id, a as any),
    view: (s, id) => getHulaView(s as any, id) as any,
    toActId: (s) => getHulaView(s as any, null).turnId,
    timeoutAction: (s, id) => hulaTimeoutAction(s as any, id),
    botAction: (s, id, r) => decideHulaAction(getHulaView(s as any, id), r),
    result: (s) => (s as any).result,
  },
};
/* eslint-enable @typescript-eslint/no-explicit-any */
