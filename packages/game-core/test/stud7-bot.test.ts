import { randomInt } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  applyStud7Action,
  BOT_CONFIG,
  botProfile,
  botThinkDelayMs,
  createStud7,
  decideStud7Action,
  estimateStud7Strength,
  getStud7LegalActions,
  getStud7View,
  parseCards,
  type Stud7State,
  type Stud7View,
} from '../src/index.js';

const toActId = (s: Stud7State) => s.players[s.toAct]!.id;

function newGame(n: number, chips = 5_000): Stud7State {
  return createStud7(
    Array.from({ length: n }, (_, i) => ({ id: `b${i}`, name: botProfile(i).name, chips, isBot: true })),
    { ante: 100, randomInt },
  );
}

describe('BotConfig', () => {
  it('난이도 수치는 한 곳에 모여 있고 실수 확률은 10~15%다', () => {
    expect(BOT_CONFIG.mistakeRate).toBeGreaterThanOrEqual(0.1);
    expect(BOT_CONFIG.mistakeRate).toBeLessThanOrEqual(0.15);
    expect(Object.isFrozen(BOT_CONFIG)).toBe(true);
  });

  it('생각 시간은 0.8~2.5초 사이다', () => {
    expect(botThinkDelayMs(() => 0)).toBe(800);
    expect(botThinkDelayMs(() => 0.999_999)).toBe(2500);
    for (let i = 0; i < 100; i++) {
      const ms = botThinkDelayMs();
      expect(ms).toBeGreaterThanOrEqual(800);
      expect(ms).toBeLessThanOrEqual(2500);
    }
  });

  it('한 방의 봇 이름은 겹치지 않는다', () => {
    const names = Array.from({ length: 12 }, (_, i) => botProfile(i).name);
    expect(new Set(names).size).toBe(12);
  });
});

describe('7포커 봇', () => {
  it('봇끼리 300판을 끝까지 치는 동안 항상 합법 액션만 고르고 칩이 보존된다', () => {
    for (let g = 0; g < 300; g++) {
      let s = newGame(2 + randomInt(4));
      const total = s.players.reduce((sum, p) => sum + p.stack + p.totalBet, 0);
      let steps = 0;
      while (s.phase !== 'finished') {
        const id = toActId(s);
        const view = getStud7View(s, id);
        const action = decideStud7Action(view);
        expect(getStud7LegalActions(s, id).map((a) => a.type)).toContain(action.type);
        // 공짜로 볼 수 있을 때는 다이하지 않는다
        if (view.legalActions.some((a) => a.type === 'check')) expect(action.type).not.toBe('die');
        s = applyStud7Action(s, id, action);
        expect(++steps).toBeLessThan(200);
      }
      expect(s.players.reduce((sum, p) => sum + p.stack, 0)).toBe(total);
    }
  });

  it('패 강도: 강한 패일수록 높게 평가한다', () => {
    const viewWith = (mine: string, other: string): Stud7View => {
      const s = createStud7(
        [
          { id: 'me', name: '봇', chips: 1000 },
          { id: 'op', name: '상대', chips: 1000 },
        ],
        { ante: 10, stackedDeck: interleave(parseCards(mine), parseCards(other)) },
      );
      return getStud7View(s, 'me');
    };
    const interleave = (a: ReturnType<typeof parseCards>, b: ReturnType<typeof parseCards>) =>
      a.flatMap((card, i) => [card, b[i]!]).concat(
        parseCards('2c 3c 4c 5c 6c 7c 8c 9c Tc Jc Qc Kc Ac').filter(
          (c) => ![...a, ...b].some((x) => x.rank === c.rank && x.suit === c.suit),
        ),
      );
    const trips = estimateStud7Strength(viewWith('As Ah Ad', '2s 7h 9d'));
    const pair = estimateStud7Strength(viewWith('Ks Kh 4d', '2s 7h 9d'));
    const junk = estimateStud7Strength(viewWith('2h 7d 9s', '3s 8h Td'));
    expect(trips).toBeGreaterThan(pair);
    expect(pair).toBeGreaterThan(junk);
  });

  it('봇은 무작위로 치는 상대보다 칩을 더 많이 딴다 (기본 전략 확인)', () => {
    let botTotal = 0;
    for (let g = 0; g < 400; g++) {
      let s = createStud7(
        [
          { id: 'bot', name: '봇', chips: 3_000, isBot: true },
          { id: 'rnd', name: '무작위', chips: 3_000 },
        ],
        { ante: 100, randomInt },
      );
      while (s.phase !== 'finished') {
        const id = toActId(s);
        const action =
          id === 'bot'
            ? decideStud7Action(getStud7View(s, id))
            : (() => {
                const legal = getStud7LegalActions(s, id);
                return { type: legal[randomInt(legal.length)]!.type };
              })();
        s = applyStud7Action(s, id, action);
      }
      botTotal += s.result!.chipDeltas.bot!;
    }
    expect(botTotal).toBeGreaterThan(0);
  });
});
