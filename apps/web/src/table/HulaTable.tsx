import { hulaCardId, isJoker, parseHulaCard, rankLabel, type HulaCard, type HulaEndReason, type HulaLegalAction, type HulaView } from '@card-game/game-core';
import { motion } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';
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

/**
 * 훌라 테이블. 실제 카드를 다루듯 직접 판단하게 한다.
 * - 덱·버린 카드를 눌러 가져온다 (못 가져오는 카드면 서버가 이유를 알려 준다)
 * - 손패는 끌어서 순서를 바꾸고, 버린 카드 위에 놓으면 버리고, 등록된 카드 위에 놓으면 붙인다
 * - 어떤 카드가 쓸모 있는지, 어디에 붙는지는 알려 주지 않는다
 */
export function HulaTable({ ctx, view }: { ctx: TableContext; view: HulaView }) {
  const { snap, placed, remaining, myRemaining, act } = ctx;
  const handKey = snap.room.handNo;
  const byId = new Map(view.players.map((p) => [p.id, p]));
  const me = view.myId ? (byId.get(view.myId) ?? null) : null;
  const finished = view.phase === 'finished';
  const turnSecs = snap.room.turnSeconds;
  const myTurn = myRemaining !== null && view.legalActions.length > 0;
  const drawTurn = myTurn && view.phase === 'draw' && !ctx.pending;
  const playTurn = myTurn && view.phase === 'play' && !ctx.pending;
  const [selected, setSelected] = useState<string[]>([]);
  /** 내가 늘어놓은 손패 순서 (카드 id). 새로 들어온 카드는 오른쪽 끝에 붙는다 */
  const [order, setOrder] = useState<string[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  /** 끌어다 놓은 직후 따라오는 클릭은 카드 고르기로 치지 않는다 */
  const lastDragEnd = useRef(0);

  // 손패가 바뀌면 사라진 카드는 선택·순서에서 빼고, 새로 들어온 카드는 "새 카드"로 잠깐 표시한다
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
    setOrder((o) => {
      const kept = o.filter((id) => handIds.includes(id));
      // 새 판이면 처음 한 번만 숫자순으로 늘어놓아 준다
      if (kept.length === 0) return sortHand(view.myHand, 'rank').map(hulaCardId);
      return [...kept, ...handIds.filter((id) => !kept.includes(id))];
    });
    // 손패 구성(handSig)이 바뀔 때만 다시 계산한다
  }, [handSig]);

  // 내 차례가 끝나면(시간 초과 포함) 고른 카드를 내려놓는다
  const myPlay = myTurn && view.phase === 'play';
  useEffect(() => {
    if (!myPlay) setSelected([]);
  }, [myPlay]);

  const cardById = new Map(view.myHand.map((c) => [hulaCardId(c), c]));
  const orderedIds = [...order.filter((id) => cardById.has(id)), ...handIds.filter((id) => !order.includes(id))];

  const has = (t: HulaLegalAction['type']) => view.legalActions.some((a) => a.type === t);
  const send = (action: unknown) => {
    setSelected([]);
    void act(action);
  };
  const tapCard = (id: string) => {
    if (Date.now() - lastDragEnd.current < 300) return;
    setSelected((sel) => (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]));
  };
  const sortBy = (mode: SortMode) => setOrder(sortHand(view.myHand, mode).map(hulaCardId));
  const layoff = (meldId: number, cards: string[]) => send({ type: 'layoff', meldId, cards });

  /** 손패 카드를 끌어다 놓은 곳: 다른 손패(순서 바꾸기), 버린 카드(버리기), 등록된 카드(붙이기) */
  const dropAt = (id: string, x: number, y: number) => {
    const hit = document
      .elementsFromPoint(x, y)
      .map((el) => el.closest<HTMLElement>('[data-drop]'))
      .find((el) => el && el.dataset.drop !== `hand:${id}`);
    const target = hit?.dataset.drop;
    if (!target) return;
    if (target.startsWith('hand:')) {
      const to = target.slice(5);
      const ids = orderedIds.filter((x) => x !== id);
      const at = ids.indexOf(to);
      if (at < 0) return;
      const movingRight = orderedIds.indexOf(id) < orderedIds.indexOf(to);
      ids.splice(movingRight ? at + 1 : at, 0, id);
      setOrder(ids);
      return;
    }
    if (!playTurn) return;
    if (target === 'discard') send({ type: 'discard', card: id });
    else if (target.startsWith('meld:')) layoff(Number(target.slice(5)), selected.includes(id) ? selected : [id]);
  };

  const turnPlayer = view.turnId ? byId.get(view.turnId) : null;
  const top = view.discardPile[view.discardPile.length - 1] ?? null;

  // 마지막으로 버린 사람 자리에서 버린 카드가 날아오게 한다
  const lastDiscard = [...view.log].reverse().find((e) => e.action === 'discard');
  const discardFrom = (() => {
    if (!lastDiscard) return undefined;
    if (lastDiscard.playerId === view.myId) return { x: 300 - DISCARD.x, y: STAGE_H - 80 - DISCARD.y };
    const p = placed.find((s) => s.seat?.id === lastDiscard.playerId);
    return p ? { x: p.x - DISCARD.x - 31, y: p.y - DISCARD.y } : undefined;
  })();

  const sentence = finished
    ? '판이 끝났습니다'
    : myTurn
      ? view.phase === 'draw'
        ? '내 차례 · 덱이나 버린 카드를 집으세요'
        : view.mustUse
          ? `가져온 ${shortCard(view.mustUse)}을(를) 이번 차례에 써야 합니다`
          : selected.length === 0
            ? '등록·붙이기를 하고 1장을 버리세요'
            : `${selected.length}장 고름 · 등록된 카드를 누르면 붙입니다`
      : turnPlayer
        ? `${turnPlayer.name} 님 차례입니다`
        : '';

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

      {/* 덱: 눌러서 한 장 가져온다 */}
      <button
        type="button"
        disabled={!drawTurn}
        onClick={() => send({ type: 'drawDeck' })}
        className="group absolute h-[86px] w-[62px] rounded-[7px] enabled:cursor-pointer"
        style={{ left: DECK.x, top: DECK.y }}
        aria-label={`덱에서 가져오기 (남은 ${view.deckCount}장)`}
      >
        <span className="lacquer-back absolute top-[3px] left-[3px] h-full w-full rounded-[7px] border-2 border-ivory/70" />
        <span className="lacquer-back absolute inset-0 rounded-[7px] border-[2.5px] border-ivory shadow-[0_3px_6px_rgb(0_0_0/0.5)] transition-transform duration-150 group-enabled:group-hover:-translate-y-1" />
      </button>
      <PileLabel x={DECK.x} title="덱" sub={`${view.deckCount}장`} />

      {/* 버린 카드: 눌러서 가져오고, 손패를 끌어다 놓으면 버린다 */}
      <div
        className={`absolute rounded-[9px] ${dragId && playTurn ? 'outline-2 outline-offset-4 outline-gold/60 outline-dashed' : ''}`}
        style={{ left: DISCARD.x, top: DISCARD.y }}
        data-drop="discard"
      >
        {top ? (
          <PlayingCard
            key={`${handKey}-d${view.discardPile.length}`}
            card={top}
            size="lg"
            from={discardFrom}
            asButton
            onClick={drawTurn ? () => send({ type: 'drawDiscard' }) : undefined}
            className={drawTurn ? 'transition-transform duration-150 hover:-translate-y-1' : ''}
            label={`버린 카드 ${cardName(top)}${drawTurn ? ' 가져오기' : ''}`}
          />
        ) : (
          <div className="h-[86px] w-[62px] rounded-[7px] border border-dashed border-gold/25" />
        )}
      </div>
      <PileLabel x={DISCARD.x} title="버린 카드" sub={view.discardPile.length ? `${view.discardPile.length}장` : '없음'} />

      {/* 등록된 카드: 고른 카드로 누르거나 손패를 끌어다 놓으면 붙인다 */}
      <div className="absolute flex flex-col" style={MELDS}>
        <p className="mb-0.5 font-serif text-[13px] leading-[18px] tracking-[0.15em] text-gold">등록된 카드</p>
        {view.melds.length === 0 ? (
          <p className="mt-6 text-center text-[13px] text-muted">아직 아무도 등록하지 않았습니다</p>
        ) : (
          <div className="flex min-h-0 flex-1 flex-wrap content-start gap-x-2.5 gap-y-1 overflow-y-auto pr-1">
            {view.melds.map((m) => {
              const owner = m.owner === view.myId ? '나' : (byId.get(m.owner)?.name ?? '');
              const canTap = playTurn && selected.length > 0;
              return (
                <motion.button
                  key={m.id}
                  type="button"
                  layout
                  data-drop={`meld:${m.id}`}
                  disabled={!canTap}
                  onClick={() => layoff(m.id, selected)}
                  className={`relative rounded-lg bg-ink/30 p-1 transition-colors ${
                    (dragId || canTap) && playTurn ? 'outline-1 outline-gold/50 outline-dashed hover:bg-gold/15' : ''
                  }`}
                  aria-label={`${owner} 등록 ${m.cards.map((c) => cardName(c)).join(', ')}${canTap ? ', 여기에 붙이기' : ''}`}
                >
                  <span className="flex -space-x-3">
                    {m.cards.map((c, i) => (
                      <PlayingCard key={`${m.id}-${i}`} card={c} size="sm" />
                    ))}
                  </span>
                  <span className="pointer-events-none absolute bottom-0.5 left-1/2 max-w-[90%] -translate-x-1/2 truncate rounded bg-ink/85 px-1.5 py-px text-[11px] leading-tight text-ivory">
                    {owner}
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
              <div className="mb-1 flex shrink-0 flex-col gap-1">
                <SortButton onClick={() => sortBy('rank')}>숫자순</SortButton>
                <SortButton onClick={() => sortBy('suit')}>무늬순</SortButton>
              </div>
            }
          >
            <div className="flex -space-x-3" aria-label="내 손패 (끌어서 순서를 바꾸거나 버린 카드·등록된 카드 위에 놓을 수 있습니다)">
              {orderedIds.map((id, i) => {
                const c = cardById.get(id)!;
                return (
                  <motion.div
                    key={`${handKey}-${id}`}
                    layout
                    drag={Boolean(me)}
                    dragSnapToOrigin
                    dragMomentum={false}
                    whileDrag={{ scale: 1.08, zIndex: 40 }}
                    onDragStart={() => setDragId(id)}
                    onDragEnd={(_e, info) => {
                      lastDragEnd.current = Date.now();
                      setDragId(null);
                      dropAt(id, info.point.x - window.scrollX, info.point.y - window.scrollY);
                    }}
                    className="relative touch-none"
                    data-drop={`hand:${id}`}
                  >
                    <PlayingCard
                      card={c}
                      size="lg"
                      selected={selected.includes(id)}
                      asButton
                      onClick={me ? () => tapCard(id) : undefined}
                      from={{ x: DECK.x - 14 - i * 50, y: DECK.y - 300 }}
                      delay={i * 0.06}
                    />
                    {fresh === id && (
                      <span className="pointer-events-none absolute inset-x-1 bottom-1 rounded bg-gold py-0.5 text-center text-[12px] leading-tight font-bold text-ink">새 카드</span>
                    )}
                  </motion.div>
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
              {view.phase === 'draw' || !myTurn ? (
                has('stop') && (
                  <ActButton onClick={() => send({ type: 'stop' })} sub={`${view.myPoints}점`}>
                    스톱
                  </ActButton>
                )
              ) : (
                <>
                  <ActButton
                    wide
                    primary={selected.length > 0}
                    disabled={selected.length === 0}
                    onClick={() => send({ type: 'meld', cards: selected })}
                    sub={selected.length ? `${selected.length}장` : '카드 고르기'}
                  >
                    등록
                  </ActButton>
                  <ActButton
                    wide
                    disabled={selected.length !== 1}
                    onClick={() => send({ type: 'discard', card: selected[0] })}
                    sub={selected.length === 1 ? shortCard(selected[0]!) : '1장 고르기'}
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

function SortButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-[38px] rounded-md border border-gold/30 px-2 text-[12px] leading-tight font-bold text-ivory-dim hover:text-ivory"
    >
      {children}
    </button>
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
