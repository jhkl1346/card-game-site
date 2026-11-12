import { hulaCardId, isJoker, parseHulaCard, type HulaCard, type HulaEndReason, type HulaView } from '@card-game/game-core';
import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { won } from '../lib/types.js';
import { PlayingCard, cardName } from '../components/PlayingCard.js';
import type { TableContext } from '../screens/TableScreen.js';
import { ActButton, BottomBand, Decision, MyInfo, NextHandBar, Payout, SeatPlate } from './common.js';
import { ResultBanner, type ResultLine } from './ResultBanner.js';

const DECK = { x: 352, y: 100 };
const DISCARD = { x: 430, y: 100 };

const END_REASON: Record<HulaEndReason, string> = {
  out: '손패를 모두 털었습니다',
  hula: '훌라! 한 번에 모두 털었습니다',
  exhausted: '덱이 떨어져 점수가 가장 낮은 사람이 이겼습니다',
  stop: '스톱 성공',
  stopFailed: '스톱 실패',
};

type SortMode = 'rank' | 'suit';
const SUIT_ORDER = { S: 0, H: 1, D: 2, C: 3 } as const;

function sortHand(cards: HulaCard[], mode: SortMode): HulaCard[] {
  const key = (c: HulaCard) => (isJoker(c) ? [99, 9] : mode === 'rank' ? [c.rank, SUIT_ORDER[c.suit]] : [SUIT_ORDER[c.suit], c.rank]);
  return [...cards].sort((a, b) => {
    const [a1, a2] = key(a);
    const [b1, b2] = key(b);
    return a1! - b1! || a2! - b2!;
  });
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

export function HulaTable({ ctx, view }: { ctx: TableContext; view: HulaView }) {
  const { snap, placed, remaining, myRemaining, act } = ctx;
  const handKey = snap.room.handNo;
  const byId = new Map(view.players.map((p) => [p.id, p]));
  const me = view.myId ? (byId.get(view.myId) ?? null) : null;
  const finished = view.phase === 'finished';
  const turnSecs = snap.room.turnSeconds;
  const myTurn = myRemaining !== null && view.legalActions.length > 0;
  const [selected, setSelected] = useState<string[]>([]);
  const [sort, setSort] = useState<SortMode>('rank');

  // 손패가 바뀌면 사라진 카드는 선택에서 뺀다
  const handIds = view.myHand.map(hulaCardId).join();
  useEffect(() => setSelected((sel) => sel.filter((id) => handIds.split(',').includes(id))), [handIds]);

  const hand = useMemo(() => sortHand(view.myHand, sort), [view.myHand, sort]);
  const legal = view.legalActions;
  const has = (t: string) => legal.some((a) => a.type === t);
  const meldMatch = legal.find((a) => a.type === 'meld' && sameSet(a.cards, selected));
  const discardOk = selected.length === 1 && legal.some((a) => a.type === 'discard' && a.card === selected[0]);
  const layoffTargets = new Set(
    selected.length === 1 ? legal.filter((a) => a.type === 'layoff' && a.cards[0] === selected[0]).map((a) => (a as { meldId: number }).meldId) : [],
  );
  const canMeldSomething = legal.some((a) => a.type === 'meld' || a.type === 'layoff');

  const toggle = (id: string) => setSelected((sel) => (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]));
  const send = (action: unknown) => {
    setSelected([]);
    void act(action);
  };

  const turnPlayer = view.turnId ? byId.get(view.turnId) : null;
  const top = view.discardPile[view.discardPile.length - 1] ?? null;
  const sentence = finished
    ? '판이 끝났습니다'
    : myTurn
      ? view.phase === 'draw'
        ? '카드를 한 장 가져와 주세요'
        : view.mustUse
          ? `가져온 ${cardName(parseHulaCard(view.mustUse))}을(를) 등록이나 붙이기에 써야 합니다`
          : canMeldSomething
            ? '카드를 골라 등록·붙이기를 하거나 한 장을 버려 주세요'
            : '버릴 카드 한 장을 골라 주세요'
      : turnPlayer
        ? `${turnPlayer.name} 님 차례입니다`
        : '';

  return (
    <>
      {placed.map((p, seatOrder) => {
        const pv = p.seat ? byId.get(p.seat.id) : undefined;
        const isTurn = !finished && view.turnId === p.seat?.id;
        return (
          <SeatPlate
            key={p.seatIndex}
            placed={p}
            isTurn={isTurn}
            remainingRatio={isTurn && remaining !== null ? remaining / (turnSecs * 1000) : null}
            status={{ sittingOut: Boolean(p.seat && !pv) , winner: finished && (view.result?.chipDeltas[p.seat?.id ?? ''] ?? 0) > 0 }}
            isHost={ctx.isHostSeat(p)}
            menu={ctx.seatMenu(p)}
            badge={
              view.dealerId === p.seat?.id ? (
                <span className="absolute -bottom-2 -left-1 grid h-[22px] w-[22px] place-items-center rounded-full bg-ivory text-[12px] font-black text-ink">D</span>
              ) : undefined
            }
          >
            {pv && (
              <div className={`absolute flex items-center gap-1.5 ${p.y < 100 ? (p.x <= 422 ? 'top-[8px] left-[132px]' : 'top-[8px] right-[132px]') : 'top-[48px] left-1/2 -translate-x-1/2'}`}>
                <div className="flex -space-x-[12px]" aria-label={`${pv.name} 님 손패 ${pv.handCount}장`}>
                  {Array.from({ length: pv.handCount }, (_, i) => (
                    <PlayingCard key={`${handKey}-${i}`} card={null} size="xs" from={{ x: DECK.x - p.x, y: DECK.y - p.y - 48 }} delay={i * 0.06 + seatOrder * 0.04} />
                  ))}
                </div>
                {pv.hasMelded && <span className="rounded bg-lacquer-3 px-1 text-[12px] font-bold whitespace-nowrap text-gold">등록</span>}
              </div>
            )}
          </SeatPlate>
        );
      })}

      {/* 덱과 버린 더미 */}
      <button
        type="button"
        disabled={!myTurn || !has('drawDeck')}
        onClick={() => send({ type: 'drawDeck' })}
        className={`absolute h-[64px] w-[46px] rounded-[6px] ${myTurn && has('drawDeck') ? 'ring-2 ring-gold ring-offset-2 ring-offset-lacquer' : ''}`}
        style={{ left: DECK.x - 23, top: DECK.y }}
        aria-label={`덱에서 가져오기 (남은 ${view.deckCount}장)`}
      >
        <span className="lacquer-back absolute top-[3px] left-[3px] h-full w-full rounded-[6px] border-2 border-ivory/70" />
        <span className="lacquer-back absolute inset-0 rounded-[6px] border-[2.5px] border-ivory shadow-[0_3px_6px_rgb(0_0_0/0.5)]" />
        <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[12px] whitespace-nowrap text-muted">덱 {view.deckCount}</span>
      </button>
      <div className="absolute" style={{ left: DISCARD.x - 23, top: DISCARD.y }}>
        {top ? (
          <PlayingCard
            key={`${handKey}-d${view.discardPile.length}`}
            card={top}
            onClick={myTurn && has('drawDiscard') ? () => send({ type: 'drawDiscard' }) : undefined}
            className={myTurn && has('drawDiscard') ? 'ring-2 ring-gold ring-offset-2 ring-offset-lacquer rounded-[6px]' : ''}
            label={`버린 카드 ${cardName(top)}${myTurn && has('drawDiscard') ? ' 가져오기' : ''}`}
          />
        ) : (
          <div className="h-[64px] w-[46px] rounded-[6px] border border-dashed border-gold/25" />
        )}
        <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[12px] whitespace-nowrap text-muted">버린 카드 {view.discardPile.length}</span>
      </div>
      <p className="absolute text-[12px] leading-tight text-muted" style={{ left: 500, top: 108 }}>
        <span className="font-serif tracking-[0.2em] text-gold">점당</span>
        <b className="block text-[18px] text-ivory">{won(view.pointValue)}</b>
      </p>

      {/* 등록된 카드 */}
      <div className="absolute flex flex-wrap content-start justify-center gap-x-3 gap-y-1.5" style={{ left: 140, top: 186, width: 564, height: 74 }}>
        {view.melds.length === 0 && <p className="self-center text-[12px] text-muted">아직 등록된 카드가 없습니다</p>}
        {view.melds.map((m) => {
          const target = layoffTargets.has(m.id);
          const owner = byId.get(m.owner)?.name ?? '';
          return (
            <motion.button
              key={m.id}
              type="button"
              layout
              disabled={!target}
              onClick={() => send({ type: 'layoff', meldId: m.id, cards: selected })}
              className={`flex items-center gap-1 rounded-md px-1 py-0.5 ${target ? 'bg-gold/15 ring-2 ring-gold' : ''}`}
              aria-label={`${owner} 님 등록${target ? ', 여기에 붙이기' : ''}`}
            >
              <span className="flex gap-px">
                {m.cards.map((c, i) => (
                  <PlayingCard key={i} card={c} size="xs" />
                ))}
              </span>
              <span className="max-w-14 truncate text-[12px] text-muted">{owner}</span>
            </motion.button>
          );
        })}
      </div>

      {finished && view.result && <Payout deltas={view.result.chipDeltas} placed={placed} myId={view.myId} k={`${snap.room.handNo}`} />}
      {finished && view.result && <ResultBanner top={150} lines={hulaLines(view)} myDelta={view.myId ? view.result.chipDeltas[view.myId] : undefined} />}

      {!snap.me.isSpectator && (
        <BottomBand>
          <div className="flex -space-x-0.5" aria-label="내 손패">
            {hand.map((c, i) => {
              const id = hulaCardId(c);
              return (
                <PlayingCard
                  key={`${handKey}-${id}`}
                  card={c}
                  size="md"
                  selected={selected.includes(id)}
                  onClick={myTurn && view.phase === 'play' ? () => toggle(id) : undefined}
                  from={{ x: DECK.x - 40 - i * 36, y: DECK.y - 300 }}
                  delay={i * 0.07}
                />
              );
            })}
          </div>
          <div className="flex shrink-0 flex-col items-start gap-1">
            <MyInfo name={me?.name ?? ''} stack={me?.stack ?? null} line={me ? `손패 ${view.myPoints}점` : '다음 판부터 참여합니다'} />
            <button type="button" onClick={() => setSort((s) => (s === 'rank' ? 'suit' : 'rank'))} className="min-h-11 rounded-md border border-gold/30 px-2.5 text-[12px] font-bold text-muted hover:text-ivory">
              {sort === 'rank' ? '무늬순 정렬' : '숫자순 정렬'}
            </button>
          </div>
          {finished ? (
            <div className="ml-auto pb-3">
              <NextHandBar nextHandAt={snap.nextHandAt} clockOffset={ctx.clockOffset} now={ctx.now} />
            </div>
          ) : (
            <Decision sentence={sentence} remaining={myRemaining} total={turnSecs}>
              {view.phase === 'draw' || !myTurn ? (
                <>
                  <ActButton primary={myTurn} disabled={!myTurn || !has('drawDeck')} onClick={() => send({ type: 'drawDeck' })}>
                    덱에서
                  </ActButton>
                  <ActButton disabled={!myTurn || !has('drawDiscard')} onClick={() => send({ type: 'drawDiscard' })}>
                    버린 카드
                  </ActButton>
                  <ActButton disabled={!myTurn || !has('stop')} onClick={() => send({ type: 'stop' })}>
                    스톱
                  </ActButton>
                </>
              ) : (
                <>
                  <ActButton primary={Boolean(meldMatch)} disabled={!meldMatch} onClick={() => meldMatch && send(meldMatch)} sub={selected.length ? `${selected.length}장` : undefined}>
                    등록
                  </ActButton>
                  <ActButton disabled={layoffTargets.size === 0} onClick={() => send({ type: 'layoff', meldId: [...layoffTargets][0], cards: selected })} sub={layoffTargets.size > 1 ? '자리 고르기' : undefined}>
                    붙이기
                  </ActButton>
                  <ActButton primary={discardOk && !meldMatch} disabled={!discardOk} onClick={() => send({ type: 'discard', card: selected[0] })}>
                    버리기
                  </ActButton>
                </>
              )}
            </Decision>
          )}
        </BottomBand>
      )}
    </>
  );
}

function hulaLines(view: HulaView): ResultLine[] {
  const r = view.result!;
  const name = (id: string) => view.players.find((p) => p.id === id)?.name ?? '';
  const lines: ResultLine[] = [{ key: 'w', title: `${name(r.winner)} 승리`, detail: END_REASON[r.reason] }];
  for (const p of view.players) {
    if (p.id === r.winner) continue;
    const pay = r.payments[p.id] ?? 0;
    lines.push({ key: p.id, title: name(p.id), detail: `${r.points[p.id] ?? 0}점`, amount: -pay, cards: r.hands[p.id] });
  }
  return lines;
}

