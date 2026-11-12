import { HOLDEM_STREET_LABELS, evaluateHand, type Card, type HoldemLegalAction, type HoldemView } from '@card-game/game-core';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { won } from '../lib/types.js';
import { PlayingCard } from '../components/PlayingCard.js';
import type { TableContext } from '../screens/TableScreen.js';
import { ActButton, BetChips, BottomBand, Decision, MyInfo, NextHandBar, Payout, Pot, SeatPlate } from './common.js';
import { ResultBanner, type ResultLine } from './ResultBanner.js';

const DECK = { x: 206, y: 140 };
const BURN = { x: 250, y: 146 };
const BOARD_X = 300;
const BOARD_Y = 140;

export function HoldemTable({ ctx, view }: { ctx: TableContext; view: HoldemView }) {
  const { snap, placed, remaining, myRemaining, act } = ctx;
  const handKey = snap.room.handNo;
  const me = view.players.find((p) => p.id === view.myId) ?? null;
  const byId = new Map(view.players.map((p) => [p.id, p]));
  const finished = view.phase === 'finished';
  const turnSecs = snap.room.turnSeconds;

  // 번 카드 → 새 카드 순서 연출: 직전 화면의 번 카드 수·보드 장수를 기억해 둔다
  const seen = useRef({ hand: handKey, burn: view.burnCount, board: view.board.length });
  if (seen.current.hand !== handKey) seen.current = { hand: handKey, burn: 0, board: 0 };
  const newBurn = view.burnCount > seen.current.burn;
  const prevBoard = seen.current.board;
  useEffect(() => {
    seen.current = { hand: handKey, burn: view.burnCount, board: view.board.length };
  });

  const toAct = view.toActId ? byId.get(view.toActId) : null;
  const mySeat = snap.me.seatIndex === null ? null : snap.room.seats[snap.me.seatIndex];
  const sentence = finished
    ? '판이 끝났습니다'
    : myRemaining !== null
      ? mySentence(view.legalActions)
      : toAct
        ? `${toAct.name} 님 차례입니다`
        : HOLDEM_STREET_LABELS[view.street];

  return (
    <>
      {/* 다른 사람 자리 */}
      {placed.map((p) => {
        const pv = p.seat ? byId.get(p.seat.id) : undefined;
        const isTurn = !finished && view.toActId === p.seat?.id;
        const showFaces = pv?.hole.some((c) => c !== null);
        return (
          <div key={p.seatIndex}>
            <SeatPlate
              placed={p}
              isTurn={isTurn}
              remainingRatio={isTurn && remaining !== null ? remaining / (turnSecs * 1000) : null}
              status={{ folded: pv?.folded, foldLabel: '폴드', allIn: pv?.allIn, sittingOut: Boolean(p.seat && !pv) , winner: finished && (view.result?.chipDeltas[p.seat?.id ?? ''] ?? 0) > 0 }}
              isHost={ctx.isHostSeat(p)}
              menu={ctx.seatMenu(p)}
              badge={<PositionBadge view={view} id={p.seat?.id} />}
            >
              {pv && !pv.folded && (
                <div
                  className={`absolute flex ${
                    p.y < 100 ? 'top-[47px] left-1/2 -translate-x-1/2' : `${p.x < 422 ? 'left-[130px]' : 'right-[130px]'} ${showFaces ? 'top-[-6px]' : 'top-[4px]'}`
                  } ${showFaces ? 'gap-0.5' : '-space-x-2'}`}
                >
                  {pv.hole.map((c, i) => (
                    <PlayingCard
                      key={`${handKey}-${i}-${c ? 'f' : 'b'}`}
                      card={c}
                      size={showFaces ? 'sm' : 'xs'}
                      from={{ x: DECK.x - p.x, y: DECK.y - p.y }}
                      delay={i * 0.25 + placed.indexOf(p) * 0.05}
                      className={showFaces ? '' : i ? 'rotate-[8deg]' : '-rotate-[8deg]'}
                    />
                  ))}
                </div>
              )}
            </SeatPlate>
            {pv && <BetChips x={p.x} y={p.y} amount={pv.roundBet} k={`${handKey}-${view.street}-${pv.id}`} />}
          </div>
        );
      })}
      {me && <BetChips x={422} y={300} amount={me.roundBet} k={`${handKey}-${view.street}-me`} />}

      {/* 덱과 번 카드 */}
      <div className="absolute" style={{ left: DECK.x - 19, top: DECK.y }} aria-label={`남은 덱 ${view.deckCount}장`}>
        <div className="lacquer-back absolute top-[3px] left-[3px] h-[52px] w-[38px] rounded-[5px] border-2 border-ivory/80" />
        <div className="lacquer-back relative h-[52px] w-[38px] rounded-[5px] border-2 border-ivory shadow-[0_3px_6px_rgb(0_0_0/0.5)]" />
      </div>
      <div className="absolute" style={{ left: BURN.x, top: BURN.y }} aria-label={`번 카드 ${view.burnCount}장`}>
        {Array.from({ length: view.burnCount }, (_, i) => (
          <motion.div
            key={`${handKey}-burn-${i}`}
            initial={i === view.burnCount - 1 && newBurn ? { x: DECK.x - 19 - BURN.x, y: DECK.y - BURN.y, rotate: 0, opacity: 1 } : false}
            animate={{ x: i * 2, y: i * -1, rotate: -14 + i * 5, opacity: 0.7 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="lacquer-back absolute h-[48px] w-[34px] rounded-[5px] border-2 border-ivory"
          />
        ))}
      </div>

      <Pot amount={view.pot} top={88} paid={finished} />

      {/* 가운데 카드 (번 카드 연출 0.5초 뒤에 펼친다) */}
      <div className="absolute flex gap-[7px]" style={{ left: BOARD_X, top: BOARD_Y }}>
        {Array.from({ length: 5 }, (_, i) => {
          const c = view.board[i];
          if (!c) return <div key={i} className="h-[64px] w-[46px] rounded-[6px] border border-dashed border-gold/15" />;
          const fresh = i >= prevBoard;
          const delay = fresh ? (newBurn ? 0.5 : 0) + (i - prevBoard) * 0.12 : 0;
          return <PlayingCard key={`${handKey}-b${i}`} card={c} from={fresh ? { x: DECK.x - BOARD_X - i * 53, y: 0 } : undefined} delay={delay} />;
        })}
      </div>

      {finished && view.result && <Payout deltas={view.result.chipDeltas} placed={placed} myId={view.myId} k={`${snap.room.handNo}`} />}
      {finished && view.result && <ResultBanner lines={holdemLines(view)} myDelta={view.myId ? view.result.chipDeltas[view.myId] : undefined} />}

      {/* 내 자리 */}
      {!snap.me.isSpectator && (
        <BottomBand>
          <div className="flex gap-1.5">
            {(me?.hole ?? []).map((c, i) => (
              <PlayingCard key={`${handKey}-me-${i}`} card={c} size="lg" dim={me?.folded} from={{ x: DECK.x - 50 - i * 68, y: DECK.y - 300 }} delay={0.1 + i * 0.25} />
            ))}
          </div>
          <MyInfo
            name={me?.name ?? snap.room.seats[snap.me.seatIndex ?? 0]?.name ?? ''}
            stack={me?.stack ?? null}
            line={
              me ? (
                <>
                  {me.folded ? '폴드했습니다' : myHandName(me.hole, view.board)}
                  {mySeat?.leaving && ' · 판이 끝나면 일어납니다'}
                  {view.buttonId === me.id && ' · 딜러'}
                  {view.smallBlindId === me.id && ' · 스몰블라인드'}
                  {view.bigBlindId === me.id && ' · 빅블라인드'}
                </>
              ) : (
                '다음 판부터 참여합니다'
              )
            }
          />
          {finished ? (
            <div className="ml-auto pb-3">
              <NextHandBar nextHandAt={snap.nextHandAt} clockOffset={ctx.clockOffset} now={ctx.now} />
            </div>
          ) : (
            <HoldemActions view={view} sentence={sentence} remaining={myRemaining} total={turnSecs} act={act} />
          )}
        </BottomBand>
      )}
    </>
  );
}

function PositionBadge({ view, id }: { view: HoldemView; id: string | undefined }) {
  if (!id) return null;
  const label = view.buttonId === id ? 'D' : view.smallBlindId === id ? 'SB' : view.bigBlindId === id ? 'BB' : null;
  if (!label) return null;
  return (
    <span className={`absolute -bottom-2 -left-1 grid h-[22px] min-w-[22px] place-items-center rounded-full px-1 text-[12px] font-black ${label === 'D' ? 'bg-ivory text-ink' : 'bg-lacquer-3 text-gold'}`}>
      {label}
    </span>
  );
}

function mySentence(legal: HoldemLegalAction[]) {
  const call = legal.find((a) => a.type === 'call');
  if (call) return <>콜 <strong className="text-[18px] text-ivory">{won(call.amount ?? 0)}</strong> 하면 계속</>;
  if (legal.some((a) => a.type === 'check')) return '체크하거나 벳할 수 있습니다';
  return '내 차례입니다';
}

function myHandName(hole: Array<Card | null>, board: Card[]): string {
  const cards = [...hole, ...board].filter((c): c is Card => c !== null);
  if (cards.length < 2) return '';
  return evaluateHand(cards).name;
}

function HoldemActions({
  view,
  sentence,
  remaining,
  total,
  act,
}: {
  view: HoldemView;
  sentence: React.ReactNode;
  remaining: number | null;
  total: number;
  act: (a: unknown) => Promise<void>;
}) {
  const legal = view.legalActions;
  const get = (t: string) => legal.find((a) => a.type === t);
  const fold = get('fold');
  const check = get('check');
  const call = get('call');
  const raise = get('raise') ?? get('bet');
  const allin = get('allin');
  const [raising, setRaising] = useState(false);
  const [amount, setAmount] = useState(0);
  const myTurn = remaining !== null && legal.length > 0;

  useEffect(() => {
    if (!myTurn) setRaising(false);
  }, [myTurn]);

  const openRaise = () => {
    if (!raise) return;
    setAmount(raise.min ?? 0);
    setRaising(true);
  };
  const presets = raise
    ? [
        { label: '최소', to: raise.min! },
        { label: '½ 판돈', to: view.currentBet + Math.round(view.pot / 2) },
        { label: '판돈만큼', to: view.currentBet + view.pot },
        { label: '최대', to: raise.max! },
      ].map((p) => ({ ...p, to: Math.min(raise.max!, Math.max(raise.min!, p.to)) }))
    : [];
  const raiseLabel = raise?.type === 'bet' ? '벳' : '레이즈';

  return (
    <Decision sentence={sentence} remaining={remaining} total={total}>
      <AnimatePresence>
        {raising && raise && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="pearl-ring absolute right-4 bottom-[118px] z-20 w-[330px] rounded-xl bg-lacquer-2 p-3 shadow-[0_10px_24px_rgb(0_0_0/0.55)]"
          >
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-[13px] text-muted">{raiseLabel} 금액 (이번 라운드 총액)</span>
              <b className="text-[20px] text-gold">{won(amount)}</b>
            </div>
            <label className="sr-only" htmlFor="raise-amount">
              {raiseLabel} 금액
            </label>
            <input
              id="raise-amount"
              type="range"
              min={raise.min}
              max={raise.max}
              step={Math.max(1, view.bigBlind)}
              value={amount}
              onChange={(e) => setAmount(Math.min(raise.max!, Number(e.target.value)))}
              className="h-8 w-full"
            />
            <div className="mt-1 grid grid-cols-4 gap-1.5">
              {presets.map((p) => (
                <button key={p.label} type="button" onClick={() => setAmount(p.to)} className="min-h-9 rounded-md bg-lacquer-3 text-[12px] font-bold text-ivory hover:bg-[#3a2c24]">
                  {p.label}
                </button>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <ActButton onClick={() => setRaising(false)}>취소</ActButton>
              <ActButton
                primary
                onClick={() => {
                  setRaising(false);
                  void act({ type: raise.type, amount });
                }}
              >
                {raiseLabel} {won(amount)}
              </ActButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <ActButton disabled={!fold} onClick={() => void act({ type: 'fold' })}>
        폴드
      </ActButton>
      {check ? (
        <ActButton primary onClick={() => void act({ type: 'check' })}>
          체크
        </ActButton>
      ) : (
        <ActButton primary={Boolean(call)} disabled={!call} onClick={() => void act({ type: 'call' })} sub={call ? won(call.amount ?? 0) : undefined}>
          콜
        </ActButton>
      )}
      <ActButton disabled={!raise} onClick={openRaise} sub={raise ? `${won(raise.min ?? 0)}~` : undefined}>
        {raiseLabel}
      </ActButton>
      <ActButton disabled={!allin} onClick={() => void act({ type: 'allin' })} sub={allin ? won(allin.amount ?? 0) : undefined}>
        올인
      </ActButton>
    </Decision>
  );
}

function holdemLines(view: HoldemView): ResultLine[] {
  const r = view.result!;
  const name = (id: string) => view.players.find((p) => p.id === id)?.name ?? '';
  return r.pots.map((pot, i) => {
    const hand = pot.winners.length ? r.hands[pot.winners[0]!] : undefined;
    const potName = r.pots.length > 1 ? (i === 0 ? '메인 팟 · ' : `사이드 팟 ${i} · `) : '';
    return {
      key: String(i),
      title: `${potName}${pot.winners.map(name).join(', ')} 승리`,
      detail: r.reason === 'fold' ? '다른 사람이 모두 폴드' : (hand?.name ?? ''),
      amount: pot.amount,
      cards: r.reason === 'showdown' ? hand?.cards : undefined,
    };
  });
}
