/**
 * 훌라 터미널 시뮬레이터: 봇끼리 판을 진행하고 과정을 출력한다. (4단계 검증용)
 *
 *   pnpm sim:hula                              # 봇 3명, 1판 자세히
 *   pnpm sim:hula --players 4 --games 500      # 500판 요약 통계
 *   pnpm sim:hula --jokers 2                   # 조커 2장 사용
 */
import { randomInt } from 'node:crypto';
import { parseArgs } from 'node:util';
import {
  applyHulaAction,
  botProfile,
  createHula,
  decideHulaAction,
  getHulaView,
  HULA_ACTION_LABELS,
  isJoker,
  rankLabel,
  type HulaCard,
  type HulaEndReason,
  type HulaState,
} from '@card-game/game-core';

const { values } = parseArgs({
  options: {
    players: { type: 'string', default: '3' },
    games: { type: 'string', default: '1' },
    point: { type: 'string', default: '10' },
    jokers: { type: 'string', default: '0' },
  },
});
const playerCount = Number(values.players);
const games = Number(values.games);
const verbose = games === 1;
const SUIT = { S: '♠', H: '♥', D: '♦', C: '♣' } as const;
const show = (c: HulaCard) => (isJoker(c) ? '조커' : `${rankLabel(c.rank)}${SUIT[c.suit]}`);
const showId = (id: string) => (id.startsWith('JK') ? '조커' : id.replace('T', '10').replace(/[shdc]$/, (s) => SUIT[s.toUpperCase() as keyof typeof SUIT]));
const won = (n: number) => n.toLocaleString('ko-KR');
const REASON: Record<HulaEndReason, string> = {
  out: '손패 모두 털기',
  hula: '훌라! (한 번에 전부 털기)',
  exhausted: '덱 소진',
  stop: '스톱 성공',
  stopFailed: '스톱 실패',
};

function playOne(): { state: HulaState; turns: number } {
  const seats = Array.from({ length: playerCount }, (_, i) => ({ id: `bot${i}`, name: botProfile(i).name, chips: 10_000, isBot: true }));
  let s = createHula(seats, {
    pointValue: Number(values.point),
    dealerIndex: randomInt(playerCount),
    rules: { jokers: Number(values.jokers) as 0 | 1 | 2 },
    randomInt,
  });
  const nameOf = (id: string) => s.players.find((p) => p.id === id)!.name;
  if (verbose) {
    console.log(`버린 더미 시작: ${show(s.discardPile[0]!)}`);
    for (const p of s.players) console.log(`  ${p.name.padEnd(5)} 손패: ${p.hand.map(show).join(' ')}`);
  }
  let turns = 0;
  while (s.phase !== 'finished') {
    const id = s.players[s.turn]!.id;
    if (s.phase === 'draw') turns++;
    const action = decideHulaAction(getHulaView(s, id));
    s = applyHulaAction(s, id, action);
    if (verbose) {
      const last = s.log[s.log.length - 1]!;
      const detail = last.cards.length ? ` ${last.cards.map(showId).join(' ')}` : '';
      const target = action.type === 'layoff' ? ` → 멜드 #${action.meldId}` : '';
      console.log(`  ${nameOf(id)}: ${HULA_ACTION_LABELS[action.type]}${detail}${target}`);
    }
  }
  if (verbose) {
    const r = s.result!;
    console.log(`\n── 결과: ${REASON[r.reason]} → ${nameOf(r.winner)} 승리 (${turns}턴)`);
    for (const m of s.melds) console.log(`  멜드 #${m.id} (${nameOf(m.owner)}): ${m.cards.map(show).join(' ')}`);
    for (const p of s.players) {
      const d = r.chipDeltas[p.id]!;
      console.log(`  ${p.name.padEnd(5)} 남은 패 ${r.hands[p.id]!.map(show).join(' ') || '없음'} (${r.points[p.id]}점)  ${d >= 0 ? '+' : ''}${won(d)}`);
    }
  }
  return { state: s, turns };
}

const reasons = new Map<HulaEndReason, number>();
let totalTurns = 0;
for (let g = 0; g < games; g++) {
  const { state, turns } = playOne();
  totalTurns += turns;
  reasons.set(state.result!.reason, (reasons.get(state.result!.reason) ?? 0) + 1);
  const total = state.players.reduce((sum, p) => sum + p.stack, 0);
  if (total !== 10_000 * playerCount) throw new Error(`칩 총량이 맞지 않습니다: ${total}`);
}
if (!verbose) {
  console.log(`봇 ${playerCount}명 × ${won(games)}판, 평균 ${(totalTurns / games).toFixed(1)}턴`);
  for (const [reason, n] of [...reasons.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${REASON[reason]}: ${((n / games) * 100).toFixed(1)}%`);
  }
  console.log('칩 총량 보존 확인: 모든 판 통과');
}
