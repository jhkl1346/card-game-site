import { STUD7_ACTION_LABELS, evaluateHand, type Card, type Stud7ActionType, type Stud7View } from '@card-game/game-core';
import { won } from '../lib/types.js';
import { PlayingCard } from '../components/PlayingCard.js';
import type { TableContext } from '../screens/TableScreen.js';
import { ActButton, BetChips, BottomBand, Decision, MyInfo, NextHandBar, Payout, Pot, SeatPlate } from './common.js';
import { ResultBanner, type ResultLine } from './ResultBanner.js';

const DECK = { x: 422, y: 190 };
/** 숨긴 카드 자리: 처음 두 장과 마지막 7번째 카드 (엔진 규칙과 같음) */
const isHiddenIndex = (i: number) => i < 2 || i === 6;
const ORDER: Stud7ActionType[] = ['die', 'check', 'call', 'bbing', 'ddadang', 'quarter', 'half', 'full'];

export function Stud7Table({ ctx, view }: { ctx: TableContext; view: Stud7View }) {
  const { snap, placed, remaining, myRemaining, act } = ctx;
  const handKey = snap.room.handNo;
  const byId = new Map(view.players.map((p) => [p.id, p]));
  const me = view.myId ? (byId.get(view.myId) ?? null) : null;
  const finished = view.phase === 'finished';
  const turnSecs = snap.room.turnSeconds;
  const toAct = view.toActId ? byId.get(view.toActId) : null;

  const legal = view.legalActions;
  const call = legal.find((a) => a.type === 'call');
  const sentence = finished
    ? '판이 끝났습니다'
    : myRemaining !== null
      ? call
        ? <>콜 <strong className="text-[18px] text-ivory">{won(call.amount)}</strong> 하면 계속</>
        : '베팅을 골라 주세요'
      : toAct
        ? `${toAct.name} 님 차례입니다`
        : '';

  const myCards = (me?.cards ?? []).filter((c): c is Card => c !== null);

  return (
    <>
      {placed.map((p, seatOrder) => {
        const pv = p.seat ? byId.get(p.seat.id) : undefined;
        const isTurn = !finished && view.toActId === p.seat?.id;
        return (
          <div key={p.seatIndex}>
            <SeatPlate
              placed={p}
              isTurn={isTurn}
              remainingRatio={isTurn && remaining !== null ? remaining / (turnSecs * 1000) : null}
              status={{ folded: pv?.folded, allIn: pv?.allIn, sittingOut: Boolean(p.seat && !pv) , winner: finished && (view.result?.chipDeltas[p.seat?.id ?? ''] ?? 0) > 0 }}
              isHost={ctx.isHostSeat(p)}
              menu={ctx.seatMenu(p)}
            >
              {pv && (
                <div
                  className={`absolute top-[48px] flex items-end gap-1 ${p.x < 200 ? 'left-0' : p.x > 644 ? 'right-0' : 'left-1/2 -translate-x-1/2'} ${pv.folded ? 'opacity-40' : ''}`}
                  aria-label={`${pv.name} 님 카드`}
                >
                  {/* 숨긴 카드(뒷면)는 작게 겹치고, 펼친 카드는 읽을 수 있게 크게 */}
                  <div className="flex -space-x-4">
                    {pv.cards.map((c, i) =>
                      c ? null : (
                        <PlayingCard
                          key={`${handKey}-${i}-b`}
                          card={null}
                          size="xs"
                          from={{ x: DECK.x - p.x, y: DECK.y - p.y - 48 }}
                          delay={i < 3 ? i * 0.3 + seatOrder * 0.06 : 0.05 * seatOrder}
                        />
                      ),
                    )}
                  </div>
                  <div className={`flex ${pv.cards.filter(Boolean).length > 4 ? '-space-x-2' : 'gap-0.5'}`}>
                    {pv.cards.map((c, i) =>
                      c ? (
                        <PlayingCard
                          key={`${handKey}-${i}-f`}
                          card={c}
                          size="sm"
                          from={{ x: DECK.x - p.x, y: DECK.y - p.y - 48 }}
                          delay={i < 3 ? i * 0.3 + seatOrder * 0.06 : 0.05 * seatOrder}
                        />
                      ) : null,
                    )}
                  </div>
                </div>
              )}
            </SeatPlate>
            {pv && (
              <BetChips
                x={p.x}
                y={p.y}
                at={p.y < 100 ? (Math.abs(p.x - 422) < 100 ? { x: p.x + 150, y: p.y + 60 } : { x: p.x + (p.x < 422 ? 50 : -50), y: p.y + 96 }) : undefined}
                amount={pv.roundBet}
                k={`${handKey}-${view.street}-${pv.id}`}
              />
            )}
          </div>
        );
      })}
      {me && <BetChips x={422} y={300} amount={me.roundBet} k={`${handKey}-${view.street}-me`} />}

      <Pot amount={view.pot} top={150} paid={finished} />
      <p className="absolute inset-x-0 top-[202px] text-center text-[12px] text-muted">
        {finished ? '' : `${view.street}번째 카드 베팅 · 앤티 ${won(view.ante)}`}
      </p>

      {finished && view.result && <Payout deltas={view.result.chipDeltas} placed={placed} myId={view.myId} k={`${snap.room.handNo}`} />}
      {finished && view.result && <ResultBanner top={198} lines={stud7Lines(view)} myDelta={view.myId ? view.result.chipDeltas[view.myId] : undefined} />}

      {!snap.me.isSpectator && (
        <BottomBand>
          <div className={`flex ${(me?.cards.length ?? 0) > 5 ? '-space-x-4' : '-space-x-1'}`} aria-label="내 카드">
            {(me?.cards ?? []).map((c, i) => (
              <PlayingCard
                key={`${handKey}-me-${i}`}
                card={c}
                size="md"
                dim={me?.folded}
                hiddenMark={isHiddenIndex(i)}
                from={{ x: DECK.x - 40 - i * 26, y: DECK.y - 300 }}
                delay={i < 3 ? 0.1 + i * 0.3 : 0.1}
              />
            ))}
          </div>
          <MyInfo
            name={me?.name ?? ''}
            stack={me?.stack ?? null}
            line={me ? (me.folded ? '다이했습니다' : myCards.length ? evaluateHand(myCards).name : '') : '다음 판부터 참여합니다'}
          />
          {finished ? (
            <div className="ml-auto pb-3">
              <NextHandBar nextHandAt={snap.nextHandAt} clockOffset={ctx.clockOffset} now={ctx.now} />
            </div>
          ) : (
            <Decision sentence={sentence} remaining={myRemaining} total={turnSecs}>
              {(myRemaining !== null ? ORDER.filter((t) => legal.some((a) => a.type === t)) : ['die', 'call', 'half'] as Stud7ActionType[]).map((t) => {
                const a = legal.find((x) => x.type === t);
                return (
                  <ActButton
                    key={t}
                    compact
                    disabled={!a}
                    primary={t === 'call' || (t === 'check' && !call)}
                    onClick={() => void act({ type: t })}
                    sub={a && a.amount > 0 ? (a.allIn ? `올인 ${won(a.amount)}` : won(a.amount)) : undefined}
                  >
                    {STUD7_ACTION_LABELS[t]}
                  </ActButton>
                );
              })}
            </Decision>
          )}
        </BottomBand>
      )}
    </>
  );
}

function stud7Lines(view: Stud7View): ResultLine[] {
  const r = view.result!;
  const name = (id: string) => view.players.find((p) => p.id === id)?.name ?? '';
  return r.pots.map((pot, i) => {
    const hand = pot.winners.length ? r.hands[pot.winners[0]!] : undefined;
    const potName = r.pots.length > 1 ? (i === 0 ? '메인 팟 · ' : `사이드 팟 ${i} · `) : '';
    return {
      key: String(i),
      title: `${potName}${pot.winners.map(name).join(', ')} 승리`,
      detail: r.reason === 'fold' ? '다른 사람이 모두 다이' : (hand?.name ?? ''),
      amount: pot.amount,
      cards: r.reason === 'showdown' ? hand?.cards : undefined,
    };
  });
}
