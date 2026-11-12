import { randomInt } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  applyHulaAction,
  botProfile,
  createHula,
  decideHulaAction,
  getHulaLegalActions,
  getHulaView,
  type HulaState,
} from '../src/index.js';
import { seeded } from './seeded.js';

const turnId = (s: HulaState) => s.players[s.turn]!.id;

describe('훌라 봇', () => {
  it('봇끼리 300판 동안 합법 액션만 고르고, 판이 끝나며, 칩이 보존된다', () => {
    for (let g = 0; g < 300; g++) {
      const n = 2 + randomInt(3);
      let s = createHula(
        Array.from({ length: n }, (_, i) => ({ id: `b${i}`, name: botProfile(i).name, chips: 5_000, isBot: true })),
        { pointValue: 10, dealerIndex: randomInt(n), rules: { jokers: randomInt(3) as 0 | 1 | 2 }, randomInt },
      );
      let steps = 0;
      while (s.phase !== 'finished') {
        const id = turnId(s);
        const action = decideHulaAction(getHulaView(s, id));
        expect(getHulaLegalActions(s, id)).toContainEqual(action);
        s = applyHulaAction(s, id, action);
        expect(++steps).toBeLessThan(2_000);
      }
      expect(s.players.reduce((sum, p) => sum + p.stack, 0)).toBe(5_000 * n);
    }
  });

  it('봇은 무작위로 치는 상대보다 칩을 더 많이 딴다 (고정 시드)', () => {
    const rng = seeded(20261112);
    let botTotal = 0;
    for (let g = 0; g < 1_000; g++) {
      let s = createHula(
        [
          { id: 'bot', name: '봇', chips: 100_000, isBot: true },
          { id: 'rnd', name: '무작위', chips: 100_000 },
        ],
        { pointValue: 1, dealerIndex: g % 2, randomInt: rng.randomInt },
      );
      while (s.phase !== 'finished') {
        const id = turnId(s);
        const legal = getHulaLegalActions(s, id);
        const action = id === 'bot' ? decideHulaAction(getHulaView(s, id), rng.random) : legal[rng.randomInt(legal.length)]!;
        s = applyHulaAction(s, id, action);
      }
      botTotal += s.result!.chipDeltas.bot!;
    }
    expect(botTotal).toBeGreaterThan(0);
  });
});
