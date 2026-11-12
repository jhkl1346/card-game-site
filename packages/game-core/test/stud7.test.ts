import { randomInt } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  applyStud7Action,
  cardIndex,
  cardToString,
  createDeck,
  createStud7,
  getStud7LegalActions,
  getStud7View,
  parseCards,
  Stud7Engine,
  stud7TimeoutAction,
  type Card,
  type PlayerInit,
  type Stud7ActionType,
  type Stud7Options,
  type Stud7State,
} from '../src/index.js';

const players = (n: number, chips = 10_000): PlayerInit[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `참가자${i}`, chips }));

/**
 * 원하는 7장을 받도록 덱을 쌓는다.
 * hands[i]는 i번 자리의 1~7번째 카드. later는 4번째 카드부터 받는 사람(다이하지 않는 사람) 목록.
 */
function stackDeck(hands: string[], later?: number[]): Card[] {
  const cards = hands.map((h) => parseCards(h));
  const deck: Card[] = [];
  for (let k = 0; k < 3; k++) for (const hand of cards) deck.push(hand[k]!);
  const receivers = later ?? cards.map((_, i) => i);
  for (let k = 3; k < 7; k++) for (const i of receivers) deck.push(cards[i]![k]!);
  const used = new Set(deck.map(cardIndex));
  expect(used.size).toBe(deck.length); // 테스트 데이터에 중복 카드가 없어야 한다
  return [...deck, ...createDeck().filter((c) => !used.has(cardIndex(c)))];
}

const start = (n: number, options: Partial<Stud7Options> = {}, chips?: number[]) =>
  createStud7(
    players(n).map((p, i) => ({ ...p, chips: chips?.[i] ?? p.chips })),
    { ante: 100, randomInt, ...options },
  );

const toActId = (s: Stud7State) => s.players[s.toAct]!.id;
const act = (s: Stud7State, type: Stud7ActionType) => applyStud7Action(s, toActId(s), { type });
const legalTypes = (s: Stud7State) => getStud7LegalActions(s, toActId(s)).map((a) => a.type);
const amountOf = (s: Stud7State, type: Stud7ActionType) =>
  getStud7LegalActions(s, toActId(s)).find((a) => a.type === type)?.amount;

/** 판이 끝날 때까지 모두 체크(또는 콜)한다 */
function checkDown(s: Stud7State): Stud7State {
  let state = s;
  while (state.phase !== 'finished') {
    state = act(state, legalTypes(state).includes('check') ? 'check' : 'call');
  }
  return state;
}

const totalChips = (s: Stud7State) => s.players.reduce((sum, p) => sum + p.stack + p.totalBet, 0);
const finalTotal = (s: Stud7State) => s.players.reduce((sum, p) => sum + p.stack, 0);

describe('7포커 시작과 분배', () => {
  it('앤티를 걷고, 첫 3장(비공개 2 + 공개 1)을 나눈다', () => {
    const s = start(4);
    expect(s.players.every((p) => p.totalBet === 100 && p.stack === 9_900)).toBe(true);
    for (const p of s.players) {
      expect(p.cards.map((c) => c.open)).toEqual([false, false, true]);
    }
    expect(s.deck).toHaveLength(52 - 12);
    expect(s.street).toBe(3);
  });

  it('인원은 2~5명만 가능하다', () => {
    expect(() => start(1)).toThrow('2~5명');
    expect(() => start(6)).toThrow('2~5명');
    expect(() => start(5)).not.toThrow();
  });

  it('난수 함수 없이 시작할 수 없다', () => {
    expect(() => createStud7(players(2), { ante: 100 })).toThrow('randomInt');
  });

  it('끝까지 가면 7장(비공개·비공개·공개×4·비공개)을 받고, 베팅 라운드는 5번이다', () => {
    let s = start(3);
    const streetsWithBetting = new Set<number>();
    while (s.phase !== 'finished') {
      streetsWithBetting.add(s.street);
      s = act(s, legalTypes(s).includes('check') ? 'check' : 'call');
    }
    expect([...streetsWithBetting]).toEqual([3, 4, 5, 6, 7]);
    for (const p of s.players) {
      expect(p.cards.map((c) => c.open)).toEqual([false, false, true, true, true, true, false]);
    }
    expect(s.result?.reason).toBe('showdown');
  });
});

describe('베팅 시작 순서 (Stud7Rules)', () => {
  const hands = [
    '9s 9h 5s Kd 2d 3d 4d',
    '8s 8h 2s Ks 2h 3h 4h',
    '7s 7h 2c Kh Qc Jc Tc',
  ];

  it('첫 라운드는 공개 카드가 가장 낮은 사람, 숫자가 같으면 무늬가 낮은 사람(클로버)부터', () => {
    const s = start(3, { stackedDeck: stackDeck(hands) });
    expect(toActId(s)).toBe('p2'); // 2♣ < 2♠
  });

  it('highestOpenCard 설정이면 공개 카드가 가장 높은 사람부터', () => {
    const s = start(3, { stackedDeck: stackDeck(hands), rules: { firstRoundStarter: 'highestOpenCard' } });
    expect(toActId(s)).toBe('p0'); // 5♠
  });

  it('2라운드부터는 공개 카드 패가 가장 높은 사람부터 (원페어 > 하이카드)', () => {
    let s = start(3, { stackedDeck: stackDeck(hands) });
    s = act(act(act(s, 'check'), 'check'), 'check');
    expect(s.street).toBe(4);
    // p1 공개: 2♠ K♠ → K 하이 / p0: 5♠ K♦ / p2: 2♣ K♥ → K 동점, 다음 카드 5 > 2 → p0
    expect(toActId(s)).toBe('p0');
    s = act(act(act(s, 'check'), 'check'), 'check');
    // 5장째: p1 공개 2♠ K♠ 2♥ → 원페어
    expect(toActId(s)).toBe('p1');
  });
});

describe('액션별 금액', () => {
  // 3명, 앤티 100 → 판돈 300
  it('첫 베팅 전에는 체크·삥·쿼터·하프·풀·다이만 가능하다 (콜·따당 없음)', () => {
    const s = start(3);
    expect(legalTypes(s)).toEqual(['check', 'bbing', 'quarter', 'half', 'full', 'die']);
    expect(amountOf(s, 'bbing')).toBe(100);
    expect(amountOf(s, 'quarter')).toBe(100); // 300 × 1/4 = 75 → 최소 단위 100
    expect(amountOf(s, 'half')).toBe(100); // 150 → 단위 내림 100
    expect(amountOf(s, 'full')).toBe(300);
  });

  it('삥 다음 사람: 콜 100, 따당 200, 쿼터·하프·풀은 콜한 뒤의 판돈 기준', () => {
    const s = act(start(3), 'bbing'); // 판돈 400, 최고 베팅 100
    expect(legalTypes(s)).toEqual(['call', 'ddadang', 'quarter', 'half', 'full', 'die']);
    expect(amountOf(s, 'call')).toBe(100);
    expect(amountOf(s, 'ddadang')).toBe(200); // 콜 100 + 100
    // 콜한 뒤 판돈 500
    expect(amountOf(s, 'quarter')).toBe(100 + 100); // 125 → 100
    expect(amountOf(s, 'half')).toBe(100 + 200); // 250 → 200
    expect(amountOf(s, 'full')).toBe(100 + 500);
  });

  it('따당은 직전 증가분만큼 더 올린다 (100 → 200 → 300)', () => {
    let s = act(start(3), 'bbing');
    s = act(s, 'ddadang');
    expect(s.currentBet).toBe(200);
    expect(amountOf(s, 'ddadang')).toBe(300); // 이 사람은 아직 0 냄 → 콜 200 + 100
    s = act(s, 'ddadang');
    expect(s.currentBet).toBe(300);
  });

  it('potBetBase=beforeCall이면 콜하기 전 판돈 기준으로 계산한다', () => {
    const s = act(start(3, { rules: { potBetBase: 'beforeCall' } }), 'bbing');
    expect(amountOf(s, 'full')).toBe(100 + 400);
  });

  it('maxBetAction=half이면 풀이 없다', () => {
    const s = start(3, { rules: { maxBetAction: 'half' } });
    expect(legalTypes(s)).not.toContain('full');
  });

  it('firstRoundActions로 첫 라운드 액션을 제한할 수 있다', () => {
    const s = start(3, { rules: { firstRoundActions: ['bbing', 'call', 'ddadang', 'die'] } });
    expect(legalTypes(s)).toEqual(['bbing', 'die']);
  });

  it('칩이 모자라면 남은 칩만 내고 올인한다', () => {
    const s = start(2, {}, [10_000, 250]); // p1은 앤티 후 150
    let state = s;
    if (toActId(state) !== 'p0') state = act(state, 'check');
    state = act(state, 'full'); // p0 풀 200
    expect(toActId(state)).toBe('p1');
    const call = getStud7LegalActions(state, 'p1').find((a) => a.type === 'call')!;
    expect(call).toEqual({ type: 'call', amount: 150, allIn: true });
    expect(legalTypes(state)).toEqual(['call', 'die']); // 콜도 못 하는 칩이면 레이즈 불가
  });
});

describe('레이즈 제한과 라운드 진행', () => {
  it('한 라운드에 한 사람은 레이즈를 2번까지만 할 수 있다', () => {
    let s = start(2, { stackedDeck: stackDeck(['2s 3s 4s 5h 6h 7h 8h', '2c 3c 9d 5d 6d 7d 8d']) });
    // p0(4♠) 먼저: 삥은 레이즈로 세지 않는다
    expect(toActId(s)).toBe('p0');
    s = act(s, 'bbing');
    s = act(s, 'ddadang'); // p1 레이즈 1
    s = act(s, 'ddadang'); // p0 레이즈 1
    s = act(s, 'ddadang'); // p1 레이즈 2
    s = act(s, 'ddadang'); // p0 레이즈 2
    expect(toActId(s)).toBe('p1');
    expect(legalTypes(s)).toEqual(['call', 'die']);
    s = act(s, 'call');
    expect(s.street).toBe(4);
    expect(toActId(s)).toBe('p1'); // 공개 9♦ 5♦ > 4♠ 5♥
    expect(legalTypes(s)).toContain('half'); // 새 라운드에는 레이즈 횟수 초기화
  });

  it('maxRaisesPerRound=null이면 제한 없이 레이즈할 수 있다', () => {
    let s = start(2, { rules: { maxRaisesPerRound: null } });
    s = act(s, 'bbing');
    for (let i = 0; i < 6; i++) s = act(s, 'ddadang');
    expect(legalTypes(s)).toContain('ddadang');
  });

  it('체크는 아무도 베팅하지 않았을 때만 가능하다', () => {
    const s = act(start(3), 'bbing');
    expect(legalTypes(s)).not.toContain('check');
  });

  it('베팅에 모두 콜하면 다음 장으로 넘어간다', () => {
    let s = start(3);
    s = act(s, 'bbing');
    s = act(s, 'call');
    expect(s.street).toBe(3);
    s = act(s, 'call');
    expect(s.street).toBe(4);
    expect(s.players.every((p) => p.cards.length === 4 && p.roundBet === 0)).toBe(true);
  });

  it('레이즈가 나오면 이미 콜한 사람도 다시 차례가 온다', () => {
    let s = start(3);
    const first = toActId(s);
    s = act(s, 'bbing');
    s = act(s, 'call');
    s = act(s, 'half');
    expect(toActId(s)).toBe(first);
    expect(s.street).toBe(3);
  });
});

describe('승부', () => {
  it('한 명만 남으면 즉시 이기고, 카드는 공개되지 않는다', () => {
    let s = start(3);
    s = act(s, 'bbing');
    s = act(s, 'die');
    s = act(s, 'die');
    expect(s.phase).toBe('finished');
    expect(s.result?.reason).toBe('fold');
    expect(s.result?.hands).toEqual({});
    const winner = s.result!.winners[0]!;
    expect(s.result!.chipDeltas[winner]).toBe(200);
    expect(Object.values(s.result!.chipDeltas).reduce((a, b) => a + b, 0)).toBe(0);

    const loser = s.players.find((p) => p.id !== winner)!.id;
    const view = getStud7View(s, loser);
    const winnerCards = view.players.find((p) => p.id === winner)!.cards;
    expect(winnerCards.filter((c) => c === null)).toHaveLength(2);
  });

  it('쇼다운에서 가장 높은 족보가 팟을 가져간다', () => {
    const deck = stackDeck(['As Ah Ac 2d 3h 7s 9c', 'Ks Kh 4c 5d 8h Js Qd', '2s 3s 6c Td Jh 4s 9s']);
    const s = checkDown(start(3, { stackedDeck: deck }));
    expect(s.result?.winners).toEqual(['p0']);
    expect(s.result?.hands.p0?.name).toBe('트리플');
    expect(s.result?.chipDeltas).toEqual({ p0: 200, p1: -100, p2: -100 });
  });

  it('완전 동점이면 팟을 나누고, 홀수 칩은 첫 라운드 시작한 사람부터 준다', () => {
    const hands = ['Ah Kh Qd Jd Tc 2s 3c', 'As Ks Qc Jc Th 2d 3h', '2c 4c 5d 7h 8s 9d 4h'];
    let s = start(3, { ante: 101, stackedDeck: stackDeck(hands, [0, 1]) });
    expect(toActId(s)).toBe('p2'); // 공개 5♦가 가장 낮음
    s = act(s, 'die');
    s = checkDown(s);
    expect(s.result?.winners).toEqual(['p0', 'p1']);
    // 판돈 303 → 152 / 151, 홀수 칩은 p2 다음인 p0
    expect(s.result?.chipDeltas).toEqual({ p0: 51, p1: 50, p2: -101 });
  });

  it('tieBreakBySuit=true면 같은 족보를 무늬로 가린다 (A♠ > A♥)', () => {
    const hands = ['Ah Kh Qd Jd Tc 2s 3c', 'As Ks Qc Jc Th 2d 3h', '2c 4c 5d 7h 8s 9d 4h'];
    let s = start(3, { stackedDeck: stackDeck(hands, [0, 1]), rules: { tieBreakBySuit: true } });
    s = act(s, 'die');
    s = checkDown(s);
    expect(s.result?.winners).toEqual(['p1']);
  });

  it('올인한 사람은 메인팟만 이기고, 사이드팟은 나머지끼리 가린다', () => {
    // p0: 칩 300 (앤티 후 200) 최고 패 / p1 > p2
    const deck = stackDeck(['As Ah Ac Ad 2d 3h 7s', 'Ks Kh Kc 5d 8h Js Qd', '2s 3s 6c Td Jh 4s 9c']);
    let s = start(3, { stackedDeck: deck }, [300, 10_000, 10_000]);
    // 첫 라운드: 공개 카드 A♣, K♣, 6♣ 중 가장 낮은 p2부터
    expect(toActId(s)).toBe('p2');
    s = act(s, 'full'); // p2 300
    s = act(s, 'call'); // p0 올인 200
    expect(s.players[0]!.allIn).toBe(true);
    s = act(s, 'call'); // p1
    s = checkDown(s);
    const pots = s.result!.pots;
    expect(pots).toHaveLength(2);
    expect(pots[0]).toMatchObject({ amount: 900, winners: ['p0'] });
    expect(pots[1]).toMatchObject({ amount: 200, winners: ['p1'] });
    expect(finalTotal(s)).toBe(300 + 20_000);
  });

  it('모두 올인이면 남은 카드를 베팅 없이 끝까지 나눈다', () => {
    let s = start(2, {}, [500, 500]);
    while (s.phase !== 'finished') {
      const types = legalTypes(s);
      s = act(s, types.includes('full') ? 'full' : 'call');
    }
    expect(s.players.every((p) => p.cards.length === 7)).toBe(true);
    expect(finalTotal(s)).toBe(1_000);
  });
});

describe('검증과 불변성', () => {
  it('차례가 아니거나 할 수 없는 액션이면 예외를 던지고 상태를 바꾸지 않는다', () => {
    const s = start(3);
    const before = JSON.stringify(s);
    const other = s.players.find((p) => p.id !== toActId(s))!.id;
    expect(() => applyStud7Action(s, other, { type: 'check' })).toThrow('차례');
    expect(() => act(s, 'call')).toThrow('할 수 없는');
    expect(() => applyStud7Action(s, 'nobody', { type: 'check' })).toThrow('참가자');
    expect(JSON.stringify(s)).toBe(before);
  });

  it('액션을 적용해도 이전 상태 객체는 바뀌지 않는다 (불변)', () => {
    const s = start(3);
    const before = JSON.stringify(s);
    const next = act(s, 'bbing');
    expect(JSON.stringify(s)).toBe(before);
    expect(next).not.toBe(s);
  });

  it('끝난 판에는 액션할 수 없다', () => {
    let s = start(2);
    s = act(s, 'die');
    expect(() => applyStud7Action(s, 'p0', { type: 'check' })).toThrow('끝난');
  });

  it('턴 시간 초과: 체크할 수 있으면 체크, 아니면 다이', () => {
    let s = start(3);
    expect(stud7TimeoutAction(s, toActId(s))).toEqual({ type: 'check' });
    s = act(s, 'bbing');
    expect(stud7TimeoutAction(s, toActId(s))).toEqual({ type: 'die' });
  });

  it('무작위 판 300번에서 칩 총량이 보존된다', () => {
    for (let g = 0; g < 300; g++) {
      const n = 2 + randomInt(4);
      let s = createStud7(
        players(n).map((p) => ({ ...p, chips: 200 + randomInt(5_000) })),
        { ante: 100, randomInt },
      );
      const total = totalChips(s);
      while (s.phase !== 'finished') {
        const legal = getStud7LegalActions(s, toActId(s));
        s = act(s, legal[randomInt(legal.length)]!.type);
        if (s.phase !== 'finished') expect(totalChips(s)).toBe(total);
      }
      expect(finalTotal(s)).toBe(total);
      expect(Object.values(s.result!.chipDeltas).reduce((a, b) => a + b, 0)).toBe(0);
    }
  });
});

describe('비공개 정보 보호 (getState)', () => {
  it('남의 비공개 카드와 남은 덱은 시야에 들어가지 않는다', () => {
    const engine = new Stud7Engine();
    engine.init(players(3), { ante: 100, randomInt });
    const full = engine.snapshot;
    const view = engine.getState('p0');

    expect(view).not.toHaveProperty('deck');
    expect(view.deckCount).toBe(full.deck.length);
    expect(view.players[0]!.cards.every((c) => c !== null)).toBe(true);
    for (const p of view.players.slice(1)) {
      expect(p.cards.map((c) => c === null)).toEqual([true, true, false]);
    }

    // 직렬화한 시야에 남의 비공개 카드와 덱 카드가 문자열로도 섞여 있지 않아야 한다
    const json = JSON.stringify(view);
    const secret = [
      ...full.players.slice(1).flatMap((p) => p.cards.filter((c) => !c.open).map((c) => c.card)),
      ...full.deck,
    ];
    const shown = new Set(
      view.players.flatMap((p) => p.cards.filter((c): c is Card => c !== null)).map(cardToString),
    );
    for (const card of secret) {
      expect(shown.has(cardToString(card))).toBe(false);
    }
    expect(json).not.toContain('"deck"');
  });

  it('관전자는 공개 카드만 본다', () => {
    const engine = new Stud7Engine();
    engine.init(players(2), { ante: 100, randomInt });
    const view = engine.getState(null);
    expect(view.myId).toBeNull();
    expect(view.legalActions).toEqual([]);
    for (const p of view.players) expect(p.cards.filter((c) => c !== null)).toHaveLength(1);
  });

  it('쇼다운 후에는 끝까지 간 사람의 카드만 공개된다', () => {
    const engine = new Stud7Engine();
    engine.init(players(3), { ante: 100, randomInt });
    const first = engine.snapshot.players[engine.snapshot.toAct]!.id;
    engine.applyAction(first, { type: 'die' });
    while (!engine.isFinished()) {
      const s = engine.snapshot;
      const id = s.players[s.toAct]!.id;
      engine.applyAction(id, { type: engine.getLegalActions(id).some((a) => a.type === 'check') ? 'check' : 'call' });
    }
    const viewer = engine.snapshot.players.find((p) => p.id !== first)!.id;
    const view = engine.getState(viewer);
    for (const p of view.players) {
      const hidden = p.cards.filter((c) => c === null).length;
      expect(hidden).toBe(p.id === first ? 2 : 0);
    }
    expect(engine.getResult()?.reason).toBe('showdown');
  });
});
