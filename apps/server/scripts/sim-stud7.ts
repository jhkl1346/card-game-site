/**
 * 7포커 터미널 시뮬레이터: 봇끼리 판을 진행하고 과정을 출력한다. (2단계 검증용)
 *
 *   pnpm sim:stud7                 # 봇 4명, 1판 자세히
 *   pnpm sim:stud7 -- --players 5 --games 500   # 500판 요약 통계
 */
import { randomInt } from 'node:crypto';
import { parseArgs } from 'node:util';
import {
  applyStud7Action,
  botProfile,
  createStud7,
  decideStud7Action,
  getStud7View,
  rankLabel,
  STUD7_ACTION_LABELS,
  SUIT_NAMES_KO,
  type Card,
  type Stud7State,
} from '@card-game/game-core';

const { values } = parseArgs({
  options: {
    players: { type: 'string', default: '4' },
    games: { type: 'string', default: '1' },
    ante: { type: 'string', default: '100' },
    chips: { type: 'string', default: '10000' },
  },
});
const playerCount = Number(values.players);
const games = Number(values.games);
const ante = Number(values.ante);
const chips = Number(values.chips);
const verbose = games === 1;

const SUIT_SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣' } as const;
const show = (c: Card | null) => (c ? `${rankLabel(c.rank)}${SUIT_SYMBOL[c.suit]}` : '??');
const won = (n: number) => n.toLocaleString('ko-KR');

function playOne(): Stud7State {
  const seats = Array.from({ length: playerCount }, (_, i) => ({
    id: `bot${i}`,
    name: botProfile(i).name,
    chips,
    isBot: true,
  }));
  let s = createStud7(seats, { ante, randomInt });
  const nameOf = (id: string) => s.players.find((p) => p.id === id)!.name;
  let street = 0;

  while (s.phase !== 'finished') {
    if (verbose && s.street !== street) {
      street = s.street;
      console.log(`\n── ${street}장째 (판돈 ${won(getStud7View(s, null).pot)}) ──`);
      for (const p of getStud7View(s, null).players) {
        if (!p.folded) console.log(`  ${p.name.padEnd(5)} 공개: ${p.cards.map(show).join(' ')}`);
      }
    }
    const id = s.players[s.toAct]!.id;
    const action = decideStud7Action(getStud7View(s, id));
    s = applyStud7Action(s, id, action);
    if (verbose) {
      const last = s.log[s.log.length - 1]!;
      const amount = last.amount > 0 ? ` ${won(last.amount)}` : '';
      console.log(`  ${nameOf(id)}: ${STUD7_ACTION_LABELS[action.type]}${amount}${last.allIn ? ' (올인)' : ''}`);
    }
  }

  if (verbose) {
    const r = s.result!;
    console.log(`\n── 결과 (${r.reason === 'fold' ? '모두 다이' : '쇼다운'}) ──`);
    for (const p of s.players) {
      const hand = r.hands[p.id];
      const cards = hand ? ` ${p.cards.map((c) => show(c.card)).join(' ')} → ${hand.name}` : p.folded ? ' (다이)' : '';
      const delta = r.chipDeltas[p.id]!;
      console.log(`  ${p.name.padEnd(5)}${cards}  ${delta >= 0 ? '+' : ''}${won(delta)}`);
    }
    r.pots.forEach((pot, i) =>
      console.log(`  ${i === 0 ? '메인팟' : `사이드팟${i}`} ${won(pot.amount)} → ${pot.winners.map(nameOf).join(', ')}`),
    );
    console.log(`\n무늬 순서(같은 숫자 비교): ${s.rules.suitRank.map((x) => SUIT_NAMES_KO[x]).join(' > ')}`);
  }
  return s;
}

const stats = { showdown: 0, fold: 0, actions: new Map<string, number>(), deltas: new Map<string, number>() };
for (let g = 0; g < games; g++) {
  const s = playOne();
  stats[s.result!.reason]++;
  for (const e of s.log) {
    if (e.action !== 'ante') stats.actions.set(e.action, (stats.actions.get(e.action) ?? 0) + 1);
  }
  for (const [id, d] of Object.entries(s.result!.chipDeltas)) stats.deltas.set(id, (stats.deltas.get(id) ?? 0) + d);
  const total = s.players.reduce((sum, p) => sum + p.stack, 0);
  if (total !== chips * playerCount) throw new Error(`칩 총량이 맞지 않습니다: ${total}`);
}

if (!verbose) {
  const totalActions = [...stats.actions.values()].reduce((a, b) => a + b, 0);
  console.log(`봇 ${playerCount}명 × ${won(games)}판 (앤티 ${won(ante)}, 시작 칩 ${won(chips)})`);
  console.log(`쇼다운 ${stats.showdown}판 / 다이로 종료 ${stats.fold}판`);
  console.log('액션 비율:');
  for (const [type, n] of [...stats.actions.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${STUD7_ACTION_LABELS[type as keyof typeof STUD7_ACTION_LABELS].padEnd(3)} ${((n / totalActions) * 100).toFixed(1)}%`);
  }
  console.log('칩 총량 보존 확인: 모든 판 통과');
}
