import { hulaCardId, isJoker, parseHulaCard, rankLabel, type HulaCard, type HulaEndReason, type HulaLegalAction, type HulaView } from '@card-game/game-core';
import { motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PlayingCard, cardName } from '../components/PlayingCard.js';
import type { TableContext } from '../screens/TableScreen.js';
import { ActButton, BottomBand, Decision, MyArea, MyLine, NextHandBar, Payout, SeatPlate, STAGE_H } from './common.js';
import { ResultBanner, type ResultLine } from './ResultBanner.js';

/** 왼쪽은 가져오는 곳(덱·버린 카드), 오른쪽은 등록된 카드 */
const DECK = { x: 150, y: 92 };
const DISCARD = { x: 224, y: 92 };
const MELDS = { left: 304, top: 94, width: 398, height: 170 };

const END_REASON: Record<HulaEndReason, string> = {
  out: '손패를 모두 털었습니다',
  hula: '훌라! 한 번에 모두 털었습니다',
  exhausted: '덱이 떨어져 점수가 가장 낮은 사람이 이겼습니다',
  stop: '스톱 성공',
  stopFailed: '스톱 실패',
};

type SortMode = 'rank' | 'suit';
const SUIT_ORDER = { S: 0, H: 1, D: 2, C: 3 } as const;
const SUIT_MARK = { S: '♠', H: '♥', D: '♦', C: '♣' } as const;

function sortHand(cards: HulaCard[], mode: SortMode): HulaCard[] {
  const key = (c: HulaCard) => (isJoker(c) ? [99, 9] : mode === 'rank' ? [c.rank, SUIT_ORDER[c.suit]] : [SUIT_ORDER[c.suit], c.rank]);
  return [...cards].sort((a, b) => {
    const [a1, a2] = key(a);
    const [b1, b2] = key(b);
    return a1! - b1! || a2! - b2!;
  });
}

/** 버튼에 쓰는 짧은 카드 이름 (♠K) */
function shortCard(id: string): string {
  const c = parseHulaCard(id);
  return isJoker(c) ? '조커' : `${SUIT_MARK[c.suit]}${rankLabel(c.rank)}`;
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
type MeldAction = Extract<HulaLegalAction, { type: 'meld' }>;
type LayoffAction = Extract<HulaLegalAction, { type: 'layoff' }>;

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
  const [suggestIndex, setSuggestIndex] = useState(0);

  // 손패가 바뀌면 사라진 카드는 선택에서 빼고, 새로 들어온 카드는 "새 카드"로 잠깐 표시한다
  const handIds = view.myHand.map(hulaCardId);
  const handSig = handIds.join();
  const prevHand = useRef<string[] | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  useEffect(() => {
    const prev = prevHand.current;
    const added = prev ? handIds.filter((id) => !prev.includes(id)) : [];
    setFresh(prev && added.length === 1 ? added[0]! : null);
    prevHand.current = handIds;
    setSelected((sel) => sel.filter((id) => handIds.includes(id)));
    setSuggestIndex(0);
    // 손패 구성(handSig)이 바뀔 때만 다시 계산한다
  }, [handSig]);

  // 내 차례가 끝나면(시간 초과 포함) 고른 카드 표시를 지운다
  const canSelect = myTurn && view.phase === 'play';
  useEffect(() => {
    if (!canSelect) setSelected([]);
  }, [canSelect]);

  const hand = useMemo(() => sortHand(view.myHand, sort), [view.myHand, sort]);
  const legal = view.legalActions;
  const has = (t: HulaLegalAction['type']) => legal.some((a) => a.type === t);
  const meldOptions = legal.filter((a): a is MeldAction => a.type === 'meld').sort((a, b) => b.cards.length - a.cards.length);
  const layoffOptions = legal.filter((a): a is LayoffAction => a.type === 'layoff');
  const meldMatch = meldOptions.find((a) => sameSet(a.cards, selected));
  const discardOk = selected.length === 1 && legal.some((a) => a.type === 'discard' && a.card === selected[0]);
  const layoffTargets = selected.length === 1 ? layoffOptions.filter((a) => a.cards[0] === selected[0]) : [];
  const targetIds = new Set(layoffTargets.map((a) => a.meldId));
  // 등록·붙이기에 쓸 수 있는 카드에는 작은 점을 찍어 알려 준다
  const usable = new Set([...meldOptions.flatMap((a) => a.cards), ...layoffOptions.flatMap((a) => a.cards)]);

  const toggle = (id: string) => setSelected((sel) => (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]));
  const send = (action: unknown) => {
    setSelected([]);
    void act(action);
  };

  const turnPlayer = view.turnId ? byId.get(view.turnId) : null;
  const top = view.discardPile[view.discardPile.length - 1] ?? null;
  const topId = top ? hulaCardId(top) : null;
  const canDrawDeck = myTurn && has('drawDeck');
  const canDrawDiscard = myTurn && has('drawDiscard');

  // 마지막으로 버린 사람 자리에서 버린 카드가 날아오게 한다
  const lastDiscard = [...view.log].reverse().find((e) => e.action === 'discard');
  const discardFrom = (() => {
    if (!lastDiscard) return undefined;
    if (lastDiscard.playerId === view.myId) return { x: 300 - DISCARD.x, y: STAGE_H - 80 - DISCARD.y };
    const p = placed.find((s) => s.seat?.id === lastDiscard.playerId);
    return p ? { x: p.x - DISCARD.x - 31, y: p.y - DISCARD.y } : undefined;
  })();

  const step = view.phase === 'draw' ? 1 : 2;
  const sentence = finished
    ? '판이 끝났습니다'
    : myTurn
      ? view.phase === 'draw'
        ? '① 덱이나 버린 카드에서 한 장 가져오세요'
        : view.mustUse
          ? `② 가져온 ${shortCard(view.mustUse)}을(를) 등록·붙이기에 쓰세요`
          : selected.length === 0
            ? meldOptions.length || layoffOptions.length
              ? '② 등록·붙이기 또는 ③ 버릴 카드 고르기'
              : '③ 버릴 카드 1장을 눌러 고르세요'
            : layoffTargets.length > 1
              ? '붙일 자리를 위에서 눌러 주세요'
              : `${selected.length}장 골랐습니다`
      : turnPlayer
        ? `${turnPlayer.name} 님 차례입니다`
        : '';

  /** 등록 버튼: 고른 카드가 맞으면 등록, 아니면 등록할 수 있는 조합을 골라 준다 (누를 때마다 다음 조합) */
  const onMeld = () => {
    if (meldMatch) return send(meldMatch);
    const option = meldOptions[suggestIndex % meldOptions.length];
    if (!option) return;
    setSelected(option.cards);
    setSuggestIndex((i) => i + 1);
  };
  /** 붙이기 버튼: 자리가 하나면 바로 붙이고, 고른 카드가 없으면 붙일 수 있는 카드를 골라 준다 */
  const onLayoff = () => {
    if (layoffTargets.length === 1) return send(layoffTargets[0]);
    if (layoffTargets.length > 1) return;
    const first = layoffOptions[suggestIndex % Math.max(1, layoffOptions.length)];
    if (!first) return;
    setSelected(first.cards);
    setSuggestIndex((i) => i + 1);
  };

  return (
    <>
      {placed.map((p, seatOrder) => {
        const pv = p.seat ? byId.get(p.seat.id) : undefined;
        const isTurn = !finished && view.turnId === p.seat?.id;
        const side = p.y >= 100;
        return (
          <SeatPlate
            key={p.seatIndex}
            placed={p}
            isTurn={isTurn}
            remainingRatio={isTurn && remaining !== null ? remaining / (turnSecs * 1000) : null}
            status={{ sittingOut: Boolean(p.seat && !pv), winner: finished && (view.result?.chipDeltas[p.seat?.id ?? ''] ?? 0) > 0 }}
            isHost={ctx.isHostSeat(p)}
            menu={ctx.seatMenu(p)}
            badge={
              view.dealerId === p.seat?.id ? (
                <span className="absolute -bottom-2 -left-1 grid h-[22px] w-[22px] place-items-center rounded-full bg-ivory text-[12px] font-black text-ink">D</span>
              ) : undefined
            }
          >
            {pv && (
              <div
                className={`absolute flex items-center gap-1.5 ${
                  side ? `top-[50px] ${p.x < 200 ? 'left-0' : 'right-0 flex-row-reverse'}` : p.x <= 422 ? 'top-[6px] left-[134px]' : 'top-[6px] right-[134px] flex-row-reverse'
                }`}
              >
                <div className="flex -space-x-[14px]" aria-hidden>
                  {Array.from({ length: pv.handCount }, (_, i) => (
                    <PlayingCard key={`${handKey}-${i}`} card={null} size="xs" from={{ x: DECK.x - p.x, y: DECK.y - p.y - 48 }} delay={i * 0.06 + seatOrder * 0.04} />
                  ))}
                </div>
                <span className="rounded-full bg-ink/80 px-2 py-0.5 text-[13px] font-bold whitespace-nowrap text-ivory" aria-label={`${pv.name} 님 손패 ${pv.handCount}장`}>
                  {pv.handCount}장
                </span>
                {pv.hasMelded && <span className="rounded bg-lacquer-3 px-1.5 py-0.5 text-[12px] font-bold whitespace-nowrap text-gold">등록함</span>}
              </div>
            )}
          </SeatPlate>
        );
      })}

      {/* ① 가져오는 곳: 덱과 버린 카드 (내 차례면 금색으로 빛나고 눌러서 가져온다) */}
      <button
        type="button"
        disabled={!canDrawDeck || ctx.pending}
        onClick={() => send({ type: 'drawDeck' })}
        className={`absolute h-[86px] w-[62px] rounded-[7px] ${canDrawDeck ? 'ring-[3px] ring-gold ring-offset-2 ring-offset-lacquer' : ''}`}
        style={{ left: DECK.x, top: DECK.y }}
        aria-label={`덱에서 가져오기 (남은 ${view.deckCount}장)`}
      >
        <span className="lacquer-back absolute top-[3px] left-[3px] h-full w-full rounded-[7px] border-2 border-ivory/70" />
        <span className="lacquer-back absolute inset-0 rounded-[7px] border-[2.5px] border-ivory shadow-[0_3px_6px_rgb(0_0_0/0.5)]" />
        {canDrawDeck && <PulseHint />}
      </button>
      <PileLabel x={DECK.x} title="덱" sub={`${view.deckCount}장`} />

      <div className="absolute" style={{ left: DISCARD.x, top: DISCARD.y }}>
        {top ? (
            <PlayingCard
              key={`${handKey}-d${view.discardPile.length}`}
              card={top}
              size="lg"
              from={discardFrom}
              onClick={canDrawDiscard && !ctx.pending ? () => send({ type: 'drawDiscard' }) : undefined}
              className={canDrawDiscard ? 'rounded-[7px] ring-[3px] ring-gold ring-offset-2 ring-offset-lacquer' : ''}
              label={`버린 카드 ${cardName(top)}${canDrawDiscard ? ' 가져오기' : ''}`}
            />
          ) : (
            <div className="h-[86px] w-[62px] rounded-[7px] border border-dashed border-gold/25" />
          )}
      </div>
      <PileLabel x={DISCARD.x} title="버린 카드" sub={view.discardPile.length ? `${view.discardPile.length}장` : '없음'} />

      {/* ② 등록된 카드 */}
      <div className="absolute flex flex-col" style={MELDS}>
        <p className="mb-0.5 flex items-baseline gap-2 font-serif text-[13px] leading-[18px] tracking-[0.15em] text-gold">
          등록된 카드
          {targetIds.size > 1 && <span className="font-sans text-[12px] tracking-normal text-ivory">붙일 자리를 눌러 주세요</span>}
        </p>
        {view.melds.length === 0 ? (
          <p className="mt-6 text-center text-[13px] text-muted">아직 아무도 등록하지 않았습니다</p>
        ) : (
          <div className="flex min-h-0 flex-1 flex-wrap content-start gap-x-2.5 gap-y-1 overflow-y-auto pr-1">
            {view.melds.map((m) => {
              const target = targetIds.has(m.id);
              const owner = m.owner === view.myId ? '나' : (byId.get(m.owner)?.name ?? '');
              const action = layoffTargets.find((a) => a.meldId === m.id);
              return (
                <motion.button
                  key={m.id}
                  type="button"
                  layout
                  disabled={!target || ctx.pending}
                  onClick={() => action && send(action)}
                  className={`flex flex-col items-start gap-0.5 rounded-lg px-1 pt-1 pb-0.5 ${target ? 'bg-gold/15 ring-2 ring-gold' : 'bg-ink/30'}`}
                  aria-label={`${owner} 등록 ${m.cards.map((c) => cardName(c)).join(', ')}${target ? ', 여기에 붙이기' : ''}`}
                >
                  <span className="flex -space-x-3">
                    {m.cards.map((c, i) => (
                      <PlayingCard key={`${m.id}-${i}`} card={c} size="sm" />
                    ))}
                  </span>
                  <span className={`max-w-full truncate px-0.5 text-[12px] leading-none ${target ? 'font-bold text-gold' : 'text-ivory-dim'}`}>
                    {target ? '여기에 붙이기' : owner}
                  </span>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>

      {finished && view.result && <Payout deltas={view.result.chipDeltas} placed={placed} myId={view.myId} k={`${snap.room.handNo}`} />}
      {finished && view.result && <ResultBanner top={150} lines={hulaLines(view)} myDelta={view.myId ? view.result.chipDeltas[view.myId] : undefined} />}

      {!snap.me.isSpectator && (
        <BottomBand>
          <MyArea
            info={<MyLine name={me?.name ?? ''} stack={me?.stack ?? null} note={me ? `손패 ${view.myPoints}점` : '다음 판부터 참여합니다'} />}
            extra={
              <button
                type="button"
                onClick={() => setSort((s) => (s === 'rank' ? 'suit' : 'rank'))}
                className="mb-1 min-h-11 shrink-0 rounded-md border border-gold/30 px-2 text-[12px] leading-tight font-bold text-ivory-dim hover:text-ivory"
              >
                {sort === 'rank' ? (
                  <>
                    무늬순
                    <br />
                    정렬
                  </>
                ) : (
                  <>
                    숫자순
                    <br />
                    정렬
                  </>
                )}
              </button>
            }
          >
            <div className="flex -space-x-3" aria-label="내 손패">
              {hand.map((c, i) => {
                const id = hulaCardId(c);
                const canPick = myTurn && view.phase === 'play' && !ctx.pending;
                return (
                  <div key={`${handKey}-${id}`} className="relative">
                    <PlayingCard
                      card={c}
                      size="lg"
                      selected={selected.includes(id)}
                      asButton
                      onClick={canPick ? () => toggle(id) : undefined}
                      from={{ x: DECK.x - 14 - i * 50, y: DECK.y - 300 }}
                      delay={i * 0.06}
                    />
                    {myTurn && view.phase === 'play' && usable.has(id) && (
                      <span className="pointer-events-none absolute top-1 right-1 h-2.5 w-2.5 rounded-full bg-gold shadow-[0_0_0_2px_var(--color-ivory)]" aria-hidden />
                    )}
                    {fresh === id && (
                      <span className="pointer-events-none absolute inset-x-1 bottom-1 rounded bg-gold py-0.5 text-center text-[12px] leading-tight font-bold text-ink">새 카드</span>
                    )}
                  </div>
                );
              })}
            </div>
          </MyArea>
          {finished ? (
            <div className="ml-auto pb-3">
              <NextHandBar nextHandAt={snap.nextHandAt} clockOffset={ctx.clockOffset} now={ctx.now} />
            </div>
          ) : (
            <Decision sentence={sentence} remaining={myRemaining} total={turnSecs} busy={ctx.pending}>
              {step === 1 || !myTurn ? (
                <>
                  <ActButton wide primary={canDrawDeck} disabled={!canDrawDeck} onClick={() => send({ type: 'drawDeck' })} sub={`${view.deckCount}장 남음`}>
                    덱에서
                  </ActButton>
                  <ActButton wide disabled={!canDrawDiscard} onClick={() => send({ type: 'drawDiscard' })} sub={topId ? shortCard(topId) : '없음'}>
                    버린 카드
                  </ActButton>
                  {has('stop') && (
                    <ActButton onClick={() => send({ type: 'stop' })} sub={`${view.myPoints}점`}>
                      스톱
                    </ActButton>
                  )}
                </>
              ) : (
                <>
                  <ActButton
                    wide
                    primary={Boolean(meldMatch)}
                    disabled={meldOptions.length === 0}
                    onClick={onMeld}
                    sub={meldMatch ? `${selected.length}장 등록` : meldOptions.length ? `${meldOptions.length}가지 가능` : '없음'}
                  >
                    {meldMatch ? '등록' : '등록 찾기'}
                  </ActButton>
                  <ActButton
                    wide
                    primary={layoffTargets.length === 1}
                    disabled={layoffOptions.length === 0 || layoffTargets.length > 1}
                    onClick={onLayoff}
                    sub={layoffTargets.length === 1 ? shortCard(layoffTargets[0]!.cards[0]!) : layoffOptions.length ? `${layoffOptions.length}가지 가능` : '없음'}
                  >
                    {layoffTargets.length ? '붙이기' : '붙일 카드'}
                  </ActButton>
                  <ActButton
                    wide
                    primary={discardOk && !meldMatch && layoffTargets.length === 0}
                    disabled={!discardOk}
                    onClick={() => send({ type: 'discard', card: selected[0] })}
                    sub={discardOk ? shortCard(selected[0]!) : '1장 고르기'}
                  >
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

function PileLabel({ x, title, sub }: { x: number; title: string; sub: string }) {
  return (
    <p className="absolute w-[62px] text-center leading-tight" style={{ left: x, top: DECK.y + 94 }}>
      <span className="block text-[13px] font-bold whitespace-nowrap text-ivory-dim">{title}</span>
      <span className="text-[12px] text-muted">{sub}</span>
    </p>
  );
}

/** 지금 눌러야 하는 곳을 알려 주는 은은한 테두리 (동작 줄이기 설정이면 멈춤) */
function PulseHint() {
  return (
    <motion.span
      className="pointer-events-none absolute -inset-1 rounded-[9px] border-2 border-gold"
      initial={{ opacity: 0.9 }}
      animate={{ opacity: [0.9, 0.2, 0.9] }}
      transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
      aria-hidden
    />
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
