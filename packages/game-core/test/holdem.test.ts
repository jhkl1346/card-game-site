import { randomInt } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  applyHoldemAction,
  cardIndex,
  createDeck,
  createHoldem,
  getHoldemLegalActions,
  getHoldemView,
  HoldemEngine,
  holdemCardsNeeded,
  holdemTimeoutAction,
  nextButtonIndex,
  parseCards,
  type Card,
  type HoldemAction,
  type HoldemActionType,
  type HoldemOptions,
  type HoldemState,
  type PlayerInit,
} from '../src/index.js';

const players = (n: number, chips: number | number[] = 10_000): PlayerInit[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `참가자${i}`,
    chips: Array.isArray(chips) ? chips[i]! : chips,
  }));

/**
 * 원하는 카드가 나오도록 덱을 쌓는다. holes[i]는 i번 자리 홀카드 2장.
 * 번 카드 3장은 burns로 지정한다(기본 규칙 기준: 플랍 전·턴 전·리버 전).
 */
function stackDeck(holes: string[], board: string, button = 0, burns = '2c 2d 2h'): Card[] {
  const n = holes.length;
  const sb = n === 2 ? button : (button + 1) % n;
  const hole = holes.map((h) => parseCards(h));
  const [b1, b2, b3] = parseCards(burns);
  const [f1, f2, f3, t, r] = parseCards(board);
  const deck: Card[] = [];
  for (let round = 0; round < 2; round++) {
    for (let k = 0; k < n; k++) deck.push(hole[(sb + k) % n]![round]!);
  }
  deck.push(b1!, f1!, f2!, f3!, b2!, t!, b3!, r!);
  const used = new Set(deck.map(cardIndex));
  expect(used.size).toBe(deck.length);
  return [...deck, ...createDeck().filter((c) => !used.has(cardIndex(c)))];
}

const start = (n: number, options: Partial<HoldemOptions> = {}, chips: number | number[] = 10_000) =>
  createHoldem(players(n, chips), { smallBlind: 50, bigBlind: 100, randomInt, ...options });

const toActId = (s: HoldemState) => s.players[s.toAct]!.id;
const act = (s: HoldemState, type: HoldemActionType, amount?: number) =>
  applyHoldemAction(s, toActId(s), amount === undefined ? { type } : { type, amount });
const legal = (s: HoldemState) => getHoldemLegalActions(s, toActId(s));
const legalTypes = (s: HoldemState) => legal(s).map((a) => a.type);
const find = (s: HoldemState, type: HoldemActionType) => legal(s).find((a) => a.type === type);

function checkDown(s: HoldemState): HoldemState {
  let state = s;
  while (state.phase !== 'finished') state = act(state, legalTypes(state).includes('check') ? 'check' : 'call');
  return state;
}

describe('블라인드와 액션 순서', () => {
  it('3명 이상: 버튼 왼쪽이 SB, 그다음이 BB, 프리플랍은 BB 왼쪽부터', () => {
    const s = start(4, { buttonIndex: 0 });
    expect(s.players.map((p) => p.totalBet)).toEqual([0, 50, 100, 0]);
    expect(toActId(s)).toBe('p3');
    expect(s.players.every((p) => p.hole.length === 2)).toBe(true);
  });

  it('버튼이 끝자리여도 블라인드가 한 바퀴 돌아간다', () => {
    const s = start(4, { buttonIndex: 3 });
    expect(s.players.map((p) => p.totalBet)).toEqual([50, 100, 0, 0]);
    expect(toActId(s)).toBe('p2');
  });

  it('헤즈업: 버튼이 SB이고 프리플랍에 먼저, 플랍부터는 나중에 액션한다', () => {
    let s = start(2, { buttonIndex: 0 });
    expect(s.players.map((p) => p.totalBet)).toEqual([50, 100]);
    expect(toActId(s)).toBe('p0');
    s = act(s, 'call');
    s = act(s, 'check'); // BB 옵션
    expect(s.street).toBe('flop');
    expect(toActId(s)).toBe('p1');
  });

  it('플랍 이후에는 버튼 왼쪽에서 가장 가까운 사람부터', () => {
    let s = start(3, { buttonIndex: 0 });
    s = act(s, 'call'); // p0
    s = act(s, 'call'); // p1 SB
    s = act(s, 'check'); // p2 BB
    expect(s.street).toBe('flop');
    expect(toActId(s)).toBe('p1');
  });

  it('모두 콜만 하면 BB에게 체크·레이즈 옵션이 있다', () => {
    let s = start(3, { buttonIndex: 0 });
    s = act(act(s, 'call'), 'call');
    expect(toActId(s)).toBe('p2');
    expect(legalTypes(s)).toEqual(['fold', 'check', 'raise', 'allin']);
  });

  it('다음 판 버튼은 한 칸씩 돈다', () => {
    expect(nextButtonIndex(0, 4)).toBe(1);
    expect(nextButtonIndex(3, 4)).toBe(0);
  });

  it('블라인드를 낼 칩이 모자라면 가진 만큼 내고 올인한다', () => {
    const s = start(3, { buttonIndex: 0 }, [10_000, 10_000, 60]);
    expect(s.players[2]).toMatchObject({ totalBet: 60, allIn: true });
    expect(s.currentBet).toBe(100); // 콜 금액은 원래 BB
    expect(find(s, 'call')?.amount).toBe(100);
  });
});

describe('No-Limit 최소 레이즈', () => {
  it('프리플랍 최소 레이즈는 BB의 2배, 최대는 내 칩 전부', () => {
    const s = start(3, { buttonIndex: 0 });
    expect(find(s, 'raise')).toEqual({ type: 'raise', min: 200, max: 10_000 });
  });

  it('레이즈 후 최소 레이즈는 직전 증가분만큼 더 (100 → 300 → 최소 500)', () => {
    let s = start(3, { buttonIndex: 0 });
    s = act(s, 'raise', 300);
    expect(find(s, 'raise')?.min).toBe(500);
    s = act(s, 'raise', 700); // 증가분 400
    expect(find(s, 'raise')?.min).toBe(1_100);
  });

  it('플랍 이후 첫 벳은 최소 BB', () => {
    let s = start(2);
    s = act(act(s, 'call'), 'check');
    expect(find(s, 'bet')).toEqual({ type: 'bet', min: 100, max: 9_900 });
    s = act(s, 'bet', 250);
    expect(find(s, 'raise')?.min).toBe(500);
  });

  it('범위를 벗어난 금액이나 금액 없는 레이즈는 거절한다', () => {
    const s = start(3);
    expect(() => act(s, 'raise', 150)).toThrow('200~10,000');
    expect(() => act(s, 'raise', 10_001)).toThrow();
    expect(() => act(s, 'raise')).toThrow();
    expect(() => act(s, 'raise', 250.5)).toThrow();
    expect(() => act(s, 'bet', 300)).toThrow('할 수 없는');
  });

  it('짧은 올인은 이미 액션한 사람에게 레이즈 권리를 다시 주지 않는다', () => {
    // 버튼 p0, SB p1(칩 400), BB p2
    let s = start(3, { buttonIndex: 0 }, [10_000, 400, 10_000]);
    s = act(s, 'raise', 300); // p0, 증가분 200
    s = act(s, 'allin'); // p1: 400까지, 증가분 100 < 200 → 짧은 올인
    expect(s.currentBet).toBe(400);
    expect(toActId(s)).toBe('p2');
    expect(legalTypes(s)).toContain('raise'); // 아직 액션 안 한 BB는 레이즈 가능
    expect(find(s, 'raise')?.min).toBe(600); // 최소 레이즈 증가분은 그대로 200
    s = act(s, 'call');
    expect(toActId(s)).toBe('p0');
    expect(legalTypes(s)).toEqual(['fold', 'call']); // p0은 콜·폴드만
  });

  it('최소 레이즈 이상의 올인은 레이즈 권리를 다시 연다', () => {
    let s = start(3, { buttonIndex: 0 }, [10_000, 1_000, 10_000]);
    s = act(s, 'raise', 300);
    s = act(s, 'allin'); // 1,000까지, 증가분 700
    s = act(s, 'call');
    expect(toActId(s)).toBe('p0');
    expect(legalTypes(s)).toContain('raise');
  });
});

describe('번 카드 (HoldemRules)', () => {
  const allCards = (s: HoldemState) => [
    ...s.players.flatMap((p) => p.hole),
    ...s.board,
    ...s.burnedCards,
    ...s.deck,
  ];

  it('플랍 전·턴 전·리버 전마다 번 카드가 1장씩 늘어난다', () => {
    let s = start(3);
    expect(s.burnedCards).toHaveLength(0);
    s = act(act(act(s, 'call'), 'call'), 'check');
    expect(s.street).toBe('flop');
    expect([s.burnedCards.length, s.board.length]).toEqual([1, 3]);
    s = act(act(act(s, 'check'), 'check'), 'check');
    expect([s.street, s.burnedCards.length, s.board.length]).toEqual(['turn', 2, 4]);
    s = act(act(act(s, 'check'), 'check'), 'check');
    expect([s.street, s.burnedCards.length, s.board.length]).toEqual(['river', 3, 5]);
  });

  it('번 카드는 덱 맨 위 카드이고, 보드·홀카드와 겹치지 않는다', () => {
    const deck = stackDeck(['Ah Kh', 'Qd Qc', '7s 8s'], '3c 4d 5h 9s Ts', 0, 'Jd Jh Js');
    const s = checkDown(start(3, { stackedDeck: deck }));
    expect(s.burnedCards.map((c) => `${c.rank}${c.suit}`)).toEqual(['11D', '11H', '11S']);
    const all = allCards(s);
    expect(all).toHaveLength(52);
    expect(new Set(all.map(cardIndex)).size).toBe(52);
  });

  it('burnBeforeFlop=false면 플랍 전에는 버리지 않는다', () => {
    let s = start(2, { rules: { burnBeforeFlop: false } });
    s = act(act(s, 'call'), 'check');
    expect(s.burnedCards).toHaveLength(0);
    s = checkDown(s);
    expect(s.burnedCards).toHaveLength(2);
  });

  it('9명이면 필요한 카드는 26장이다', () => {
    expect(holdemCardsNeeded(9)).toBe(26);
    expect(() => start(9)).not.toThrow();
    expect(() => start(10)).toThrow('2~9명');
  });

  it('시야에는 번 카드 개수만 있고, 판이 끝난 뒤에도 내용은 없다', () => {
    let s = start(3);
    s = checkDown(s);
    expect(s.result?.reason).toBe('showdown');
    for (const viewer of ['p0', 'p1', null]) {
      const view = getHoldemView(s, viewer);
      expect(view.burnCount).toBe(3);
      expect(view).not.toHaveProperty('burnedCards');
      expect(view).not.toHaveProperty('deck');
      const json = JSON.stringify(view);
      for (const card of [...s.burnedCards, ...s.deck]) {
        expect(json).not.toContain(JSON.stringify({ rank: card.rank, suit: card.suit }));
      }
    }
    expect(JSON.stringify(s.result)).not.toContain('burn');
  });

  it('진행 중 시야에는 남의 홀카드가 없다', () => {
    const engine = new HoldemEngine();
    engine.init(players(4), { smallBlind: 50, bigBlind: 100, randomInt });
    const view = engine.getState('p1');
    expect(view.players[1]!.hole.every((c) => c !== null)).toBe(true);
    for (const p of view.players.filter((x) => x.id !== 'p1')) expect(p.hole).toEqual([null, null]);
    const json = JSON.stringify(view);
    for (const p of engine.snapshot.players.filter((x) => x.id !== 'p1')) {
      for (const c of p.hole) expect(json).not.toContain(JSON.stringify({ rank: c.rank, suit: c.suit }));
    }
    expect(engine.getState(null).players.every((p) => p.hole.every((c) => c === null))).toBe(true);
  });
});

describe('승부와 팟', () => {
  it('한 명만 남으면 즉시 이기고 홀카드를 공개하지 않는다', () => {
    let s = start(3, { buttonIndex: 0 });
    s = act(s, 'fold');
    s = act(s, 'fold');
    expect(s.result).toMatchObject({ reason: 'fold', winners: ['p2'], hands: {} });
    expect(s.result?.chipDeltas).toEqual({ p0: 0, p1: -50, p2: 50 });
    expect(getHoldemView(s, 'p0').players[2]!.hole).toEqual([null, null]);
  });

  it('쇼다운에서 7장 중 최고 5장으로 승자를 정한다', () => {
    const deck = stackDeck(['Ah Kh', 'Qd Qc', '7s 8s'], '3h 9h Qh 4c 2s');
    const s = checkDown(start(3, { stackedDeck: deck }));
    expect(s.result?.winners).toEqual(['p0']);
    expect(s.result?.hands.p0?.name).toBe('플러시');
    expect(s.result?.hands.p1?.name).toBe('트리플');
    expect(s.result?.chipDeltas).toEqual({ p0: 200, p1: -100, p2: -100 });
    // 쇼다운까지 간 사람의 홀카드는 공개된다
    expect(getHoldemView(s, 'p2').players[0]!.hole.every((c) => c !== null)).toBe(true);
  });

  it('보드가 최고 패면 무승부, 홀수 칩은 버튼 왼쪽에서 가까운 승자부터', () => {
    // SB 5 / BB 10, 버튼 p0, SB p1, BB p2
    const deck = stackDeck(['2h 3h', '4d 5d', '6c 7c'], 'As Ks Qs Js Ts', 0, '8d 8h 9c');
    let s = start(3, { smallBlind: 5, bigBlind: 10, stackedDeck: deck });
    s = act(s, 'call'); // p0 10
    s = act(s, 'fold'); // p1 5 버림
    s = checkDown(s); // 판돈 25
    expect(s.result?.winners).toEqual(['p2', 'p0']);
    expect(s.result?.chipDeltas).toEqual({ p0: 2, p1: -5, p2: 3 });
  });

  it('올인한 사람은 메인팟만, 사이드팟은 나머지끼리 가린다', () => {
    // p1(칩 500)이 최고 패, p0 > p2
    const deck = stackDeck(['Kh Kd', 'Ah Ad', '7s 8c'], '2c 5d 9h Jc 3s', 0, '4h 6h Th');
    let s = start(3, { stackedDeck: deck }, [10_000, 500, 10_000]);
    s = act(s, 'raise', 1_000); // p0
    expect(find(s, 'call')).toEqual({ type: 'call', amount: 450, allIn: true });
    expect(legalTypes(s)).toEqual(['fold', 'call']); // 콜보다 칩이 적으면 콜이 곧 올인
    s = act(s, 'call'); // p1 500 올인
    expect(s.players[1]!.allIn).toBe(true);
    s = act(s, 'call'); // p2
    s = checkDown(s);
    const pots = s.result!.pots;
    expect(pots).toHaveLength(2);
    expect(pots[0]).toMatchObject({ amount: 1_500, winners: ['p1'] });
    expect(pots[1]).toMatchObject({ amount: 1_000, winners: ['p0'] });
    expect(s.result?.chipDeltas).toEqual({ p0: 0, p1: 1_000, p2: -1_000 });
  });

  it('모두 올인하면 남은 보드를 번 카드 규칙대로 끝까지 펼친다', () => {
    let s = start(2, {}, [1_000, 1_000]);
    s = act(s, 'allin');
    s = act(s, 'call');
    expect(s.phase).toBe('finished');
    expect(s.board).toHaveLength(5);
    expect(s.burnedCards).toHaveLength(3);
    expect(s.players.reduce((sum, p) => sum + p.stack, 0)).toBe(2_000);
  });
});

describe('검증과 불변성', () => {
  it('차례가 아니면 예외를 던지고 상태를 바꾸지 않는다', () => {
    const s = start(3);
    const before = JSON.stringify(s);
    const other = s.players.find((p) => p.id !== toActId(s))!.id;
    expect(() => applyHoldemAction(s, other, { type: 'fold' })).toThrow('차례');
    expect(() => act(s, 'check')).toThrow('할 수 없는');
    expect(JSON.stringify(s)).toBe(before);
    const next = act(s, 'call');
    expect(JSON.stringify(s)).toBe(before);
    expect(next).not.toBe(s);
  });

  it('턴 시간 초과: 체크할 수 있으면 체크, 아니면 폴드', () => {
    let s = start(2);
    expect(holdemTimeoutAction(s, toActId(s))).toEqual({ type: 'fold' });
    s = act(s, 'call');
    expect(holdemTimeoutAction(s, toActId(s))).toEqual({ type: 'check' });
  });

  it('무작위 판 300번에서 칩 총량이 보존된다', () => {
    for (let g = 0; g < 300; g++) {
      const n = 2 + randomInt(8);
      const chips = Array.from({ length: n }, () => 50 + randomInt(5_000));
      let s = createHoldem(players(n, chips), {
        smallBlind: 25,
        bigBlind: 50,
        buttonIndex: randomInt(n),
        randomInt,
      });
      const total = chips.reduce((a, b) => a + b, 0);
      while (s.phase !== 'finished') {
        const options = legal(s);
        const choice = options[randomInt(options.length)]!;
        const action: HoldemAction =
          choice.type === 'bet' || choice.type === 'raise'
            ? { type: choice.type, amount: choice.min! + randomInt(choice.max! - choice.min! + 1) }
            : { type: choice.type };
        s = applyHoldemAction(s, toActId(s), action);
      }
      expect(s.players.reduce((sum, p) => sum + p.stack, 0)).toBe(total);
      expect(Object.values(s.result!.chipDeltas).reduce((a, b) => a + b, 0)).toBe(0);
    }
  });
});
