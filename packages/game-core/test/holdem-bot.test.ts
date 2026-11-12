import { randomInt } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  applyHoldemAction,
  botProfile,
  createHoldem,
  decideHoldemAction,
  getHoldemLegalActions,
  getHoldemView,
  parseCards,
  preflopStrength,
  type HoldemState,
} from '../src/index.js';
import { seeded } from './seeded.js';

const toActId = (s: HoldemState) => s.players[s.toAct]!.id;

describe('홀덤 봇', () => {
  it('프리플랍 강도: AA > AKs > 72o', () => {
    const aa = preflopStrength(parseCards('As Ah'));
    const aks = preflopStrength(parseCards('As Ks'));
    const junk = preflopStrength(parseCards('7d 2c'));
    expect(aa).toBeGreaterThan(aks);
    expect(aks).toBeGreaterThan(junk);
  });

  it('봇끼리 300판 동안 합법 액션만 고르고 칩이 보존된다', () => {
    for (let g = 0; g < 300; g++) {
      const n = 2 + randomInt(8);
      let s = createHoldem(
        Array.from({ length: n }, (_, i) => ({ id: `b${i}`, name: botProfile(i).name, chips: 2_000 + randomInt(8_000), isBot: true })),
        { smallBlind: 50, bigBlind: 100, buttonIndex: randomInt(n), randomInt },
      );
      const total = s.players.reduce((sum, p) => sum + p.stack + p.totalBet, 0);
      let steps = 0;
      while (s.phase !== 'finished') {
        const id = toActId(s);
        const view = getHoldemView(s, id);
        const action = decideHoldemAction(view);
        const legal = getHoldemLegalActions(s, id).find((a) => a.type === action.type);
        expect(legal).toBeDefined();
        if (action.type === 'bet' || action.type === 'raise') {
          expect(action.amount).toBeGreaterThanOrEqual(legal!.min!);
          expect(action.amount).toBeLessThanOrEqual(legal!.max!);
        }
        if (view.legalActions.some((a) => a.type === 'check')) expect(action.type).not.toBe('fold');
        s = applyHoldemAction(s, id, action);
        expect(++steps).toBeLessThan(300);
      }
      expect(s.players.reduce((sum, p) => sum + p.stack, 0)).toBe(total);
    }
  });

  it('봇은 무작위로 치는 상대보다 칩을 더 많이 딴다', () => {
    // 판별 결과의 분산이 커서 고정 시드로 결정적으로 검사한다
    const rng = seeded(20261112);
    let botTotal = 0;
    for (let g = 0; g < 2_000; g++) {
      let s = createHoldem(
        [
          { id: 'bot', name: '봇', chips: 3_000, isBot: true },
          { id: 'rnd', name: '무작위', chips: 3_000 },
        ],
        { smallBlind: 50, bigBlind: 100, buttonIndex: g % 2, randomInt: rng.randomInt },
      );
      while (s.phase !== 'finished') {
        const id = toActId(s);
        if (id === 'bot') {
          s = applyHoldemAction(s, id, decideHoldemAction(getHoldemView(s, id), rng.random));
        } else {
          const legal = getHoldemLegalActions(s, id);
          const pick = legal[rng.randomInt(legal.length)]!;
          s = applyHoldemAction(s, id, pick.min !== undefined ? { type: pick.type, amount: pick.min } : { type: pick.type });
        }
      }
      botTotal += s.result!.chipDeltas.bot!;
    }
    expect(botTotal).toBeGreaterThan(0);
  });
});
