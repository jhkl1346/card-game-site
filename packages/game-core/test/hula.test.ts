import { randomInt } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  applyHulaAction,
  classifyMeld,
  createHula,
  DEFAULT_HULA_RULES,
  findMelds,
  getHulaLegalActions,
  getHulaView,
  handPoints,
  hulaCardId,
  hulaCardPoints,
  HulaEngine,
  hulaTimeoutAction,
  parseHulaCard,
  type HulaAction,
  type HulaCard,
  type HulaOptions,
  type HulaState,
  type PlayerInit,
} from '../src/index.js';

const cards = (text: string): HulaCard[] => text.split(/\s+/).filter(Boolean).map(parseHulaCard);
const meld = (text: string, isNew = true, rules = DEFAULT_HULA_RULES) => classifyMeld(cards(text), rules, isNew);

const players = (n: number, chips: number | number[] = 10_000): PlayerInit[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `참가자${i}`, chips: Array.isArray(chips) ? chips[i]! : chips }));

/** hands[i]: i번 자리의 7장, flip: 처음 펼칠 카드, rest: 그다음 덱 순서. full=false면 덱을 거기서 끝낸다. */
function stack(hands: string[], flip: string, rest = '', dealer = 0, full = true): HulaCard[] {
  const n = hands.length;
  const hs = hands.map(cards);
  const deck: HulaCard[] = [];
  for (let r = 0; r < 7; r++) for (let k = 1; k <= n; k++) deck.push(hs[(dealer + k) % n]![r]!);
  deck.push(...cards(flip), ...cards(rest));
  const ids = deck.map(hulaCardId);
  expect(new Set(ids).size).toBe(ids.length);
  if (!full) return deck;
  const all = cards('2 3 4 5 6 7 8 9 T J Q K A'.split(' ').flatMap((r) => ['s', 'h', 'd', 'c'].map((s) => r + s)).join(' '));
  return [...deck, ...all.filter((c) => !ids.includes(hulaCardId(c)))];
}

const start = (n: number, options: Partial<HulaOptions> = {}, chips?: number | number[]) =>
  createHula(players(n, chips), { pointValue: 10, randomInt, ...options });

const turnId = (s: HulaState) => s.players[s.turn]!.id;
const play = (s: HulaState, action: HulaAction) => applyHulaAction(s, turnId(s), action);
const legal = (s: HulaState) => getHulaLegalActions(s, turnId(s));
const hand = (s: HulaState, id: string) => s.players.find((p) => p.id === id)!.hand.map(hulaCardId);

describe('멜드 판정', () => {
  it('세트: 같은 숫자 3~4장, 무늬는 서로 달라야 한다', () => {
    expect(meld('9h 9d 9c')).toBe('set');
    expect(meld('9h 9d 9c 9s')).toBe('set');
    expect(meld('9h 9d')).toBeNull();
  });

  it('런: 같은 무늬 연속 3장 이상, A는 A-2-3과 Q-K-A 모두 가능, K-A-2는 불가', () => {
    expect(meld('3s 4s 5s')).toBe('run');
    expect(meld('5s 3s 4s 6s 7s')).toBe('run');
    expect(meld('As 2s 3s')).toBe('run');
    expect(meld('Qs Ks As')).toBe('run');
    expect(meld('Ks As 2s')).toBeNull();
    expect(meld('3s 4h 5s')).toBeNull();
    expect(meld('3s 5s 6s')).toBeNull();
    expect(meld('Qs Ks As', true, { ...DEFAULT_HULA_RULES, aceHighInRun: false })).toBeNull();
  });

  it('7은 한 장만으로 등록할 수 있고(sevenAlone), 7 멜드에는 다른 7이나 같은 무늬 6·8을 붙인다', () => {
    expect(meld('7c')).toBe('seven');
    expect(meld('8c')).toBeNull();
    expect(meld('7c', true, { ...DEFAULT_HULA_RULES, sevenAlone: false })).toBeNull();
    expect(meld('7c 7h', false)).toBe('set');
    expect(meld('7c 8c', false)).toBe('run');
    expect(meld('7c 9c', false)).toBeNull();
  });

  it('조커는 아무 카드나 대신하지만 일반 카드가 1장은 있어야 한다', () => {
    expect(meld('5s JK1 7s')).toBe('run');
    expect(meld('3s JK1 JK2 6s')).toBe('run');
    expect(meld('5s 5h JK1')).toBe('set');
    expect(meld('JK1 JK2')).toBeNull();
    expect(meld('3s JK1 7s')).toBeNull();
  });

  it('손패에서 가능한 멜드를 모두 찾는다', () => {
    const found = findMelds(cards('3s 4s 5s 9h 9d 9c Kh'), DEFAULT_HULA_RULES).map((m) => m.length);
    expect(found.sort()).toEqual([3, 3]);
    expect(findMelds(cards('3s 4s 5s 6s'), DEFAULT_HULA_RULES)).toHaveLength(3); // 345, 456, 3456
  });

  it('카드 점수: A=1, 숫자 그대로, J/Q/K=10(설정 시 11~13), 조커=30', () => {
    expect(handPoints(cards('Ah 7d Tc Js Qh Kd'), DEFAULT_HULA_RULES)).toBe(1 + 7 + 10 + 30);
    const ranked = { ...DEFAULT_HULA_RULES, faceCardPoints: 'ranked' as const };
    expect(handPoints(cards('Js Qh Kd'), ranked)).toBe(36);
    expect(hulaCardPoints({ joker: 1 }, DEFAULT_HULA_RULES)).toBe(30);
  });
});

describe('훌라 준비', () => {
  it('각자 7장, 버린 더미 1장, 첫 차례는 딜러 다음 자리', () => {
    const s = start(4, { dealerIndex: 2 });
    expect(s.players.every((p) => p.hand.length === 7)).toBe(true);
    expect(s.discardPile).toHaveLength(1);
    expect(s.deck).toHaveLength(52 - 28 - 1);
    expect(turnId(s)).toBe('p3');
    expect(s.phase).toBe('draw');
  });

  it('인원은 2~4명, 조커를 켜면 덱에 들어간다', () => {
    expect(() => start(1)).toThrow('2~4명');
    expect(() => start(5)).toThrow('2~4명');
    const s = start(2, { rules: { jokers: 2 } });
    expect(s.deck.length + 15).toBe(54);
  });
});

describe('턴 진행', () => {
  const P1 = '3s 4s Kd Qh 8c 2h 9d';
  const P0 = 'Ac 2c 3c 6d 7d Td Th';

  it('가져오기 전에는 덱/버린 카드/스톱만, 가져온 뒤에는 등록·붙이기·버리기', () => {
    let s = start(2, { stackedDeck: stack([P0, P1], 'Jc') });
    expect(turnId(s)).toBe('p1');
    expect(legal(s)).toEqual([{ type: 'drawDeck' }]); // J♣은 쓸 수 없고, 점수가 높아 스톱 불가
    expect(() => play(s, { type: 'discard', card: '3s' })).toThrow('먼저 카드를');
    s = play(s, { type: 'drawDeck' });
    expect(s.phase).toBe('play');
    expect(() => play(s, { type: 'drawDeck' })).toThrow('이미 카드를');
    expect(legal(s).filter((a) => a.type === 'discard')).toHaveLength(8);
    s = play(s, { type: 'discard', card: 'Kd' });
    expect(turnId(s)).toBe('p0');
    expect(s.discardPile.map(hulaCardId)).toEqual(['Jc', 'Kd']);
  });

  it('버린 카드는 바로 멜드에 쓸 수 있을 때만 가져오고, 쓰기 전에는 버릴 수 없다', () => {
    let s = start(2, { stackedDeck: stack([P0, P1], '5s') });
    expect(legal(s).map((a) => a.type)).toContain('drawDiscard');
    s = play(s, { type: 'drawDiscard' });
    expect(s.mustUse).toBe('5s');
    expect(legal(s)).toEqual([{ type: 'meld', cards: ['3s', '4s', '5s'] }]);
    expect(() => play(s, { type: 'discard', card: 'Kd' })).toThrow('먼저 써야');
    s = play(s, { type: 'meld', cards: ['3s', '4s', '5s'] });
    expect(s.mustUse).toBeNull();
    expect(legal(s).some((a) => a.type === 'discard')).toBe(true);
  });

  it('쓸 수 없는 버린 카드를 가져오려 하면 거절한다 (discardPickup=free면 허용)', () => {
    const s = start(2, { stackedDeck: stack([P0, P1], 'Jc') });
    expect(() => play(s, { type: 'drawDiscard' })).toThrow('바로 등록');
    const free = start(2, { stackedDeck: stack([P0, P1], 'Jc'), rules: { discardPickup: 'free' } });
    const after = play(free, { type: 'drawDiscard' });
    expect(after.mustUse).toBeNull();
  });

  it('남의 멜드에 붙일 수 있다 (layOffToOthers=false면 불가)', () => {
    const P1b = '3s 4s 5s 9h 9d 9c Kh';
    const deck = stack([P0, P1b], 'Jh', 'Qd 6s');
    const run = (rules = {}) => {
      let s = start(2, { stackedDeck: deck, rules });
      s = play(s, { type: 'drawDeck' });
      s = play(s, { type: 'meld', cards: ['3s', '4s', '5s'] });
      s = play(s, { type: 'discard', card: 'Qd' });
      return play(s, { type: 'drawDeck' }); // p0이 6♠을 가져옴
    };
    const s = run();
    expect(legal(s)).toContainEqual({ type: 'layoff', meldId: 1, cards: ['6s'] });
    const after = play(s, { type: 'layoff', meldId: 1, cards: ['6s'] });
    expect(after.melds[0]!.cards.map(hulaCardId)).toEqual(['3s', '4s', '5s', '6s']);
    expect(legal(run({ layOffToOthers: false })).some((a) => a.type === 'layoff')).toBe(false);
  });

  it('잘못된 등록·붙이기·차례 위반은 거절하고 상태를 바꾸지 않는다', () => {
    let s = start(2, { stackedDeck: stack([P0, P1], 'Jc') });
    s = play(s, { type: 'drawDeck' });
    const before = JSON.stringify(s);
    expect(() => play(s, { type: 'meld', cards: ['3s', '4s', 'Kd'] })).toThrow('등록할 수 없는');
    expect(() => play(s, { type: 'meld', cards: ['3s', '4s', '5h'] })).toThrow('손에 없는');
    expect(() => play(s, { type: 'layoff', meldId: 99, cards: ['3s'] })).toThrow('없는 멜드');
    expect(() => applyHulaAction(s, 'p0', { type: 'discard', card: 'Ac' })).toThrow('차례');
    expect(JSON.stringify(s)).toBe(before);
    const next = play(s, { type: 'discard', card: 'Kd' });
    expect(JSON.stringify(s)).toBe(before);
    expect(next).not.toBe(s);
  });
});

describe('승리와 정산', () => {
  it('훌라: 한 번도 등록하지 않다가 한 턴에 전부 털면 정산 ×2', () => {
    const P0 = 'Kc Qc Jc 2d 4h 6h 8h'; // 50점
    const P1 = '3s 4s 5s 9h 9d 9c 7c';
    let s = start(2, { stackedDeck: stack([P0, P1], '2c', 'Kd') });
    s = play(s, { type: 'drawDeck' });
    s = play(s, { type: 'meld', cards: ['3s', '4s', '5s'] });
    s = play(s, { type: 'meld', cards: ['9h', '9d', '9c'] });
    s = play(s, { type: 'meld', cards: ['7c'] });
    expect(hand(s, 'p1')).toEqual(['Kd']);
    s = play(s, { type: 'discard', card: 'Kd' });
    expect(s.result).toMatchObject({ reason: 'hula', winner: 'p1' });
    expect(s.result?.points.p0).toBe(50);
    expect(s.result?.chipDeltas).toEqual({ p0: -1_000, p1: 1_000 });
  });

  it('이미 등록한 사람이 나중에 다 털면 일반 승리(×1)', () => {
    const P0 = 'Ac 2d 3h 4c 8d Tc Jd'; // 38점
    const P1 = '3s 4s 5s 9h 9d 9c Kh';
    let s = start(2, { stackedDeck: stack([P0, P1], 'Jh', 'Qd 2c 6s') });
    s = play(s, { type: 'drawDeck' });
    s = play(s, { type: 'meld', cards: ['3s', '4s', '5s'] });
    s = play(s, { type: 'meld', cards: ['9h', '9d', '9c'] });
    s = play(s, { type: 'discard', card: 'Qd' });
    s = play(s, { type: 'drawDeck' }); // p0: 2♣
    s = play(s, { type: 'discard', card: '2c' });
    s = play(s, { type: 'drawDeck' }); // p1: 6♠
    s = play(s, { type: 'layoff', meldId: 1, cards: ['6s'] });
    s = play(s, { type: 'discard', card: 'Kh' });
    expect(s.result).toMatchObject({ reason: 'out', winner: 'p1', payments: { p0: 380, p1: 0 } });
  });

  it('덱이 떨어지면 남은 점수가 가장 낮은 사람이 이긴다', () => {
    const P0 = 'Ac 2d 3h 4s 5d 6c 8s'; // 29점
    const P1 = 'Kc Kd Qh Js 9c 8d 6h';
    let s = start(2, { stackedDeck: stack([P0, P1], 'Th', '5c', 0, false) });
    s = play(s, { type: 'drawDeck' });
    s = play(s, { type: 'discard', card: 'Kc' });
    expect(s.result).toMatchObject({ reason: 'exhausted', winner: 'p0' });
    expect(s.result?.points).toEqual({ p0: 29, p1: 58 });
    expect(s.result?.chipDeltas).toEqual({ p0: 580, p1: -580 });
  });

  it('스톱: 손패가 기준 점수 이하일 때만, 가장 낮으면 선언자 승리', () => {
    const low = 'Ah Ad Ac As 2h 2d 2c'; // 10점
    const high = 'Kc Qc Jc 9d 8h 6h 5s';
    const s = start(2, { stackedDeck: stack([high, low], '3s') });
    expect(legal(s).map((a) => a.type)).toContain('stop');
    const done = play(s, { type: 'stop' });
    expect(done.result).toMatchObject({ reason: 'stop', winner: 'p1', declarer: 'p1' });

    const notAllowed = start(2, { stackedDeck: stack([low, high], '3s') });
    expect(legal(notAllowed).map((a) => a.type)).not.toContain('stop');
    expect(() => play(notAllowed, { type: 'stop' })).toThrow('10점 이하');
  });

  it('스톱 실패: 선언자보다 낮은 사람이 있으면 그 사람이 이기고 선언자는 2배', () => {
    const rules = { stopMaxPoints: 20 };
    const declarer = 'Ah Ad 2h 2d 3h 3d 5c'; // 17점
    const lower = 'Ac As 2c 2s 3c 3s 4h'; // 16점
    let s = start(2, { stackedDeck: stack([lower, declarer], 'Kd'), rules });
    s = play(s, { type: 'stop' });
    expect(s.result).toMatchObject({ reason: 'stopFailed', winner: 'p0', declarer: 'p1' });
    expect(s.result?.payments.p1).toBe(17 * 10 * 2);

    // 점수가 같으면 선언자 승리
    const tie = 'Ac As 2c 2s 3c 3s 5h'; // 17점
    s = play(start(2, { stackedDeck: stack([tie, declarer], 'Kd'), rules }), { type: 'stop' });
    expect(s.result?.winner).toBe('p1');
  });

  it('테이블 칩보다 많이 낼 수 없고, 칩 총량은 보존된다', () => {
    const P0 = 'Kc Qc Jc 2d 4h 6h 8h';
    const P1 = '3s 4s 5s 9h 9d 9c 7c';
    let s = start(2, { stackedDeck: stack([P0, P1], '2c', 'Kd') }, [300, 10_000]);
    s = play(s, { type: 'drawDeck' });
    for (const m of [['3s', '4s', '5s'], ['9h', '9d', '9c'], ['7c']]) s = play(s, { type: 'meld', cards: m });
    s = play(s, { type: 'discard', card: 'Kd' });
    expect(s.result?.payments.p0).toBe(300);
    expect(s.result?.finalChips).toEqual({ p0: 0, p1: 10_300 });
  });

  it("settlement='fixed'면 점수와 관계없이 고정 판돈 × 배수", () => {
    const P0 = 'Kc Qc Jc 2d 4h 6h 8h';
    const P1 = '3s 4s 5s 9h 9d 9c 7c';
    let s = start(2, { stackedDeck: stack([P0, P1], '2c', 'Kd'), fixedStake: 200, rules: { settlement: 'fixed' } });
    s = play(s, { type: 'drawDeck' });
    for (const m of [['3s', '4s', '5s'], ['9h', '9d', '9c'], ['7c']]) s = play(s, { type: 'meld', cards: m });
    s = play(s, { type: 'discard', card: 'Kd' });
    expect(s.result?.payments.p0).toBe(400); // 훌라 ×2
  });
});

describe('비공개 정보와 자동 진행', () => {
  it('남의 손패와 남은 덱은 시야에 없고, 장수만 보인다', () => {
    const engine = new HulaEngine();
    engine.init(players(3), { pointValue: 10, randomInt });
    const view = engine.getState('p0');
    expect(view.myHand).toHaveLength(7);
    expect(view.players.map((p) => p.handCount)).toEqual([7, 7, 7]);
    expect(view).not.toHaveProperty('deck');
    expect(view.deckCount).toBe(engine.snapshot.deck.length);
    const json = JSON.stringify(view);
    const secret = [...engine.snapshot.players.slice(1).flatMap((p) => p.hand), ...engine.snapshot.deck];
    for (const c of secret) expect(json).not.toContain(JSON.stringify(c));
    expect(engine.getState(null).myHand).toEqual([]);
  });

  it('덱에서 가져온 카드는 기록(log)에 남기지 않는다', () => {
    let s = start(2);
    s = play(s, { type: 'drawDeck' });
    expect(s.log[0]).toEqual({ playerId: 'p1', action: 'drawDeck', cards: [] });
  });

  it('시간 초과 자동 액션으로 턴이 넘어간다 (가져오기 → 가장 높은 카드 버리기)', () => {
    let s = start(2, { stackedDeck: stack(['Ac 2c 3c 6d 7d Td Th', '3s 4s Kd Qh 8c 2h 9d'], 'Jc', '5h') });
    s = play(s, hulaTimeoutAction(s, 'p1'));
    expect(s.phase).toBe('play');
    const discard = hulaTimeoutAction(s, 'p1');
    expect(['Kd', 'Qh']).toContain((discard as { card: string }).card);
    s = play(s, discard);
    expect(turnId(s)).toBe('p0');
  });

  it('무작위로 300판을 끝까지 진행해도 칩이 보존되고 판이 끝난다', () => {
    for (let g = 0; g < 300; g++) {
      const n = 2 + randomInt(3);
      const chips = Array.from({ length: n }, () => 100 + randomInt(3_000));
      let s = createHula(players(n, chips), {
        pointValue: 1 + randomInt(20),
        dealerIndex: randomInt(n),
        rules: { jokers: randomInt(3) as 0 | 1 | 2 },
        randomInt,
      });
      let steps = 0;
      while (s.phase !== 'finished') {
        const options = legal(s);
        s = play(s, options[randomInt(options.length)]!);
        expect(++steps).toBeLessThan(2_000);
      }
      expect(s.players.reduce((sum, p) => sum + p.stack, 0)).toBe(chips.reduce((a, b) => a + b, 0));
      expect(Object.values(s.result!.chipDeltas).reduce((a, b) => a + b, 0)).toBe(0);
    }
  });
});
