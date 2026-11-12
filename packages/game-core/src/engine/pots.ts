/** 한 사람이 이번 판에 낸 총 금액 */
export interface Contribution {
  id: string;
  amount: number;
  folded: boolean;
}

/** 메인팟/사이드팟. eligible은 이 팟을 이길 수 있는 사람(다이하지 않았고 이 수준까지 낸 사람) */
export interface Pot {
  amount: number;
  eligible: string[];
}

function sameMembers(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

/**
 * 각자 낸 금액으로 메인팟과 사이드팟을 나눈다. (7포커·홀덤 공용)
 * - 낸 금액의 서로 다른 수준마다 층을 나누고, 그 수준까지 낸 사람만 그 층을 이길 수 있다.
 * - 다이한 사람이 낸 칩도 팟에 들어가지만, 그 사람은 어떤 팟도 이길 수 없다.
 * - 이길 수 있는 사람이 같은 층은 하나로 합친다.
 * - 다이한 사람만 도달한 층(이길 사람이 없는 칩)은 바로 아래 팟에 합친다.
 */
export function computePots(contributions: readonly Contribution[]): Pot[] {
  const levels = [...new Set(contributions.map((c) => c.amount).filter((a) => a > 0))].sort(
    (a, b) => a - b,
  );
  const pots: Pot[] = [];
  let previous = 0;
  let carry = 0; // 아직 이길 사람이 정해지지 않은 칩

  for (const level of levels) {
    let amount = 0;
    for (const c of contributions) {
      amount += Math.min(c.amount, level) - Math.min(c.amount, previous);
    }
    previous = level;
    const eligible = contributions.filter((c) => !c.folded && c.amount >= level).map((c) => c.id);
    const last = pots[pots.length - 1];

    if (eligible.length === 0) {
      if (last) last.amount += amount;
      else carry += amount;
      continue;
    }
    if (last && sameMembers(last.eligible, eligible)) {
      last.amount += amount + carry;
    } else {
      pots.push({ amount: amount + carry, eligible });
    }
    carry = 0;
  }
  return pots;
}

/**
 * 팟을 승자들에게 나눈다. 나누어떨어지지 않는 칩은 winnersInOrder 앞사람부터 1개씩 더 준다.
 * (어느 순서로 줄지는 각 게임 규칙이 정해서 넘긴다)
 */
export function splitPot(amount: number, winnersInOrder: readonly string[]): Record<string, number> {
  if (winnersInOrder.length === 0) throw new Error('팟을 받을 승자가 없습니다');
  const base = Math.floor(amount / winnersInOrder.length);
  let remainder = amount - base * winnersInOrder.length;
  const shares: Record<string, number> = {};
  for (const id of winnersInOrder) {
    shares[id] = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
  }
  return shares;
}
