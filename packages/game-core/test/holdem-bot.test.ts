import { randomInt } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  applyHoldemAction,
  botProfile,
  createHoldem,
  decideHoldemAction,
  getHoldemLegalActions,
  getHoldemView,
  chenScore,
  parseCards,
  preflopStrength,
  readHoldemHand,
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

  it('Chen 점수: AA 20, AKs 12, 72o는 음수', () => {
    expect(chenScore(parseCards('As Ah'))).toBe(20);
    expect(chenScore(parseCards('As Ks'))).toBe(12);
    expect(chenScore(parseCards('7d 2c'))).toBeLessThan(0);
  });

  it('패 읽기: 셋 > 오버 페어 > 톱 페어 > 보드만 페어', () => {
    const board = parseCards('9s 5d 2c');
    const set = readHoldemHand(parseCards('9h 9d'), board, 1).made;
    const over = readHoldemHand(parseCards('Kh Kd'), board, 1).made;
    const top = readHoldemHand(parseCards('9c Ad'), board, 1).made;
    const boardPair = readHoldemHand(parseCards('Ah Kd'), parseCards('9s 9d 2c'), 1).made;
    expect(set).toBeGreaterThan(over);
    expect(over).toBeGreaterThan(top);
    expect(top).toBeGreaterThan(boardPair);
    expect(readHoldemHand(parseCards('Ah 4h'), parseCards('Kh 7h 2c'), 1).drawEquity).toBeGreaterThan(0.3);
  });

  it('6인 봇 테이블에서 사람처럼 적당히 참여하고 레이즈한다 (VPIP 18~32%, PFR 9~22%)', () => {
    const rng = seeded(99);
    const n = 6;
    let hands = 0;
    let vpip = 0;
    let pfr = 0;
    for (let g = 0; g < 1_000; g++) {
      let s = createHoldem(
        Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: botProfile(i).name, chips: 10_000, isBot: true })),
        { smallBlind: 50, bigBlind: 100, buttonIndex: g % n, randomInt: rng.randomInt },
      );
      while (s.phase !== 'finished') {
        const id = toActId(s);
        s = applyHoldemAction(s, id, decideHoldemAction(getHoldemView(s, id), rng.random));
      }
      for (const p of s.players) {
        hands++;
        const pre = s.log.filter((e) => e.playerId === p.id && e.street === 'preflop');
        if (pre.some((e) => ['call', 'raise', 'bet', 'allin'].includes(e.action))) vpip++;
        if (pre.some((e) => ['raise', 'bet', 'allin'].includes(e.action))) pfr++;
      }
    }
    expect(vpip / hands).toBeGreaterThan(0.18);
    expect(vpip / hands).toBeLessThan(0.32);
    expect(pfr / hands).toBeGreaterThan(0.09);
    expect(pfr / hands).toBeLessThan(0.22);
  });

  it('무조건 올인하는 상대에게 칩을 잃지 않는다 (겁먹고 다 접지 않음)', () => {
    const rng = seeded(4242);
    let botTotal = 0;
    for (let g = 0; g < 2_000; g++) {
      let s = createHoldem(
        [
          { id: 'bot', name: '봇', chips: 3_000, isBot: true },
          { id: 'shove', name: '올인', chips: 3_000 },
        ],
        { smallBlind: 50, bigBlind: 100, buttonIndex: g % 2, randomInt: rng.randomInt },
      );
      while (s.phase !== 'finished') {
        const id = toActId(s);
        if (id === 'bot') s = applyHoldemAction(s, id, decideHoldemAction(getHoldemView(s, id), rng.random));
        else {
          const legal = getHoldemLegalActions(s, id);
          const pick = legal.find((a) => a.type === 'allin') ?? legal.find((a) => a.type === 'call') ?? legal[0]!;
          s = applyHoldemAction(s, id, { type: pick.type });
        }
      }
      botTotal += s.result!.chipDeltas.bot!;
    }
    expect(botTotal).toBeGreaterThan(0);
  });
});
