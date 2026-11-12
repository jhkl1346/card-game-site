import { describe, expect, it } from 'vitest';
import { computePots, splitPot } from '../src/index.js';

const c = (id: string, amount: number, folded = false) => ({ id, amount, folded });

describe('사이드팟 계산', () => {
  it('모두 같은 금액이면 팟은 하나', () => {
    expect(computePots([c('a', 300), c('b', 300), c('c', 300)])).toEqual([
      { amount: 900, eligible: ['a', 'b', 'c'] },
    ]);
  });

  it('한 명이 적게 올인하면 메인팟과 사이드팟으로 나뉜다', () => {
    expect(computePots([c('a', 100), c('b', 300), c('c', 300)])).toEqual([
      { amount: 300, eligible: ['a', 'b', 'c'] },
      { amount: 400, eligible: ['b', 'c'] },
    ]);
  });

  it('올인 금액이 서로 다르면 층마다 팟이 생긴다', () => {
    expect(computePots([c('a', 50), c('b', 200), c('c', 500), c('d', 500)])).toEqual([
      { amount: 200, eligible: ['a', 'b', 'c', 'd'] },
      { amount: 450, eligible: ['b', 'c', 'd'] },
      { amount: 600, eligible: ['c', 'd'] },
    ]);
  });

  it('다이한 사람의 칩은 팟에 들어가지만 그 사람은 받을 수 없다', () => {
    expect(computePots([c('a', 200, true), c('b', 300), c('c', 300)])).toEqual([
      { amount: 800, eligible: ['b', 'c'] },
    ]);
  });

  it('혼자 더 낸 금액(콜 받지 못한 베팅)은 본인만 받을 수 있는 팟이 된다', () => {
    expect(computePots([c('a', 100), c('b', 400)])).toEqual([
      { amount: 200, eligible: ['a', 'b'] },
      { amount: 300, eligible: ['b'] },
    ]);
  });

  it('다이한 사람만 도달한 금액은 아래 팟에 합친다', () => {
    const pots = computePots([c('a', 100), c('b', 100), c('c', 500, true)]);
    expect(pots).toEqual([{ amount: 700, eligible: ['a', 'b'] }]);
  });

  it('팟 총액은 낸 금액의 합과 같다', () => {
    const contributions = [c('a', 37), c('b', 120, true), c('c', 120), c('d', 999), c('e', 5)];
    const total = computePots(contributions).reduce((sum, p) => sum + p.amount, 0);
    expect(total).toBe(37 + 120 + 120 + 999 + 5);
  });
});

describe('팟 분할', () => {
  it('나누어떨어지면 똑같이 나눈다', () => {
    expect(splitPot(300, ['a', 'b', 'c'])).toEqual({ a: 100, b: 100, c: 100 });
  });

  it('홀수 칩은 앞사람부터 1개씩 더 준다', () => {
    expect(splitPot(302, ['b', 'a', 'c'])).toEqual({ b: 101, a: 101, c: 100 });
  });

  it('승자가 없으면 예외', () => {
    expect(() => splitPot(10, [])).toThrow();
  });
});
