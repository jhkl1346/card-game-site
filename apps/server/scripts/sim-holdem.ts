/**
 * 텍사스 홀덤 터미널 시뮬레이터: 봇끼리 같은 테이블에서 여러 판을 이어서 친다. (3단계 검증용)
 * 판마다 딜러 버튼이 돌고, 칩이 다음 판으로 이어지며, 칩이 0이 된 봇은 빠진다.
 *
 *   pnpm sim:holdem                               # 봇 6명, 1판 자세히
 *   pnpm sim:holdem --players 9 --hands 1000      # 1000판 요약 통계
 */
import { randomInt } from 'node:crypto';
import { parseArgs } from 'node:util';
import {
  applyHoldemAction,
  botProfile,
  createHoldem,
  decideHoldemAction,
  getHoldemView,
  HOLDEM_ACTION_LABELS,
  HOLDEM_STREET_LABELS,
  nextButtonIndex,
  rankLabel,
  type Card,
  type HoldemState,
} from '@card-game/game-core';

const { values } = parseArgs({
  options: {
    players: { type: 'string', default: '6' },
    hands: { type: 'string', default: '1' },
    chips: { type: 'string', default: '10000' },
    sb: { type: 'string', default: '50' },
    bb: { type: 'string', default: '100' },
  },
});
const hands = Number(values.hands);
const verbose = hands === 1;
const SUIT = { S: '♠', H: '♥', D: '♦', C: '♣' } as const;
const show = (c: Card | null) => (c ? `${rankLabel(c.rank)}${SUIT[c.suit]}` : '??');
const won = (n: number) => n.toLocaleString('ko-KR');

let table = Array.from({ length: Number(values.players) }, (_, i) => ({
  id: `bot${i}`,
  name: botProfile(i).name,
  chips: Number(values.chips),
  isBot: true,
}));
const totalChips = table.reduce((sum, p) => sum + p.chips, 0);
let button = 0;
const stats = { played: 0, showdown: 0, actions: new Map<string, number>(), maxBurn: 0 };

for (let h = 0; h < hands && table.length >= 2; h++) {
  let s: HoldemState = createHoldem(table, {
    smallBlind: Number(values.sb),
    bigBlind: Number(values.bb),
    buttonIndex: button % table.length,
    randomInt,
  });
  const nameOf = (id: string) => s.players.find((p) => p.id === id)!.name;
  if (verbose) {
    const v = getHoldemView(s, null);
    console.log(`버튼 ${nameOf(v.buttonId)} / SB ${nameOf(v.smallBlindId)} ${won(s.smallBlind)} / BB ${nameOf(v.bigBlindId)} ${won(s.bigBlind)}`);
  }
  let street = '';
  while (s.phase !== 'finished') {
    if (verbose && s.street !== street) {
      street = s.street;
      const v = getHoldemView(s, null);
      console.log(`\n── ${HOLDEM_STREET_LABELS[s.street]} (판돈 ${won(v.pot)}, 번 카드 ${v.burnCount}장) ${v.board.map(show).join(' ')}`);
    }
    const id = s.players[s.toAct]!.id;
    const action = decideHoldemAction(getHoldemView(s, id));
    s = applyHoldemAction(s, id, action);
    const last = s.log[s.log.length - 1]!;
    stats.actions.set(action.type, (stats.actions.get(action.type) ?? 0) + 1);
    if (verbose) {
      const amount = last.amount > 0 ? ` ${won(last.amount)}` : '';
      console.log(`  ${nameOf(id)}: ${HOLDEM_ACTION_LABELS[action.type]}${amount}${last.allIn ? ' (올인)' : ''}`);
    }
  }

  const r = s.result!;
  stats.played++;
  if (r.reason === 'showdown') stats.showdown++;
  stats.maxBurn = Math.max(stats.maxBurn, getHoldemView(s, null).burnCount);
  if (verbose) {
    console.log(`\n── 결과 (${r.reason === 'fold' ? '모두 폴드' : '쇼다운'}) 보드: ${r.board.map(show).join(' ')}`);
    for (const p of s.players) {
      const hand = r.hands[p.id];
      const desc = hand ? ` ${hand.hole.map(show).join(' ')} → ${hand.name}` : p.folded ? ' (폴드)' : '';
      const d = r.chipDeltas[p.id]!;
      console.log(`  ${p.name.padEnd(5)}${desc}  ${d >= 0 ? '+' : ''}${won(d)}`);
    }
    r.pots.forEach((pot, i) => console.log(`  ${i === 0 ? '메인팟' : `사이드팟${i}`} ${won(pot.amount)} → ${pot.winners.map(nameOf).join(', ')}`));
  }

  // 다음 판: 칩 반영, 칩 0인 봇 제외, 버튼 이동
  const buttonId = s.players[s.button]!.id;
  table = table.map((p) => ({ ...p, chips: r.finalChips[p.id]! }));
  const sum = table.reduce((acc, p) => acc + p.chips, 0);
  if (sum !== totalChips) throw new Error(`칩 총량이 맞지 않습니다: ${sum}`);
  const survivors = table.filter((p) => p.chips > 0);
  const buttonPos = survivors.findIndex((p) => p.id === buttonId);
  button = buttonPos >= 0 ? nextButtonIndex(buttonPos, survivors.length) : button % Math.max(1, survivors.length);
  table = survivors;
}

if (!verbose) {
  const total = [...stats.actions.values()].reduce((a, b) => a + b, 0);
  console.log(`${won(stats.played)}판 진행 (쇼다운 ${stats.showdown}판), 남은 봇 ${table.length}명`);
  console.log(`판당 번 카드 최대 ${stats.maxBurn}장, 칩 총량 보존 확인: 모든 판 통과`);
  console.log('액션 비율:');
  for (const [type, n] of [...stats.actions.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${HOLDEM_ACTION_LABELS[type as keyof typeof HOLDEM_ACTION_LABELS].padEnd(3)} ${((n / total) * 100).toFixed(1)}%`);
  }
  console.log('남은 칩:', table.map((p) => `${p.name} ${won(p.chips)}`).join(', '));
}
