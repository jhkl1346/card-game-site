import { STUD7_ACTION_LABELS, evaluateHand, type Card, type Stud7ActionType, type Stud7View } from '@card-game/game-core';
import { useEffect, useState, type ReactNode } from 'react';
import { won } from '../lib/types.js';
import { PlayingCard, cardName } from '../components/PlayingCard.js';
import type { TableContext } from '../screens/TableScreen.js';
import { ActButton, BetChips, BottomBand, Decision, MY_CHIPS, MyArea, MyLine, NextHandBar, Payout, Pot, SeatPlate } from './common.js';
import { ResultBanner, type ResultLine } from './ResultBanner.js';

const DECK = { x: 422, y: 190 };
/** 마지막 7번째 카드 자리 (히든 카드) */
const HIDDEN_LAST = 6;
const ORDER: Stud7ActionType[] = ['die', 'check', 'call', 'bbing', 'ddadang', 'quarter', 'half', 'full'];

export function Stud7Table({ ctx, view }: { ctx: TableContext; view: Stud7View }) {
  const { snap, placed, remaining, myRemaining, act } = ctx;
  const handKey = snap.room.handNo;
  const byId = new Map(view.players.map((p) => [p.id, p]));
  const me = view.myId ? (byId.get(view.myId) ?? null) : null;
  const finished = view.phase === 'finished';
  const choosing = view.phase === 'choose';
  const turnSecs = snap.room.turnSeconds;
  const toAct = view.toActId ? byId.get(view.toActId) : null;
  const myTurn = myRemaining !== null && view.legalActions.length > 0;

  // 공개할 카드 고르기: 먼저 카드를 누르고, 버튼으로 확정한다
  const [pick, setPick] = useState<number | null>(null);
  // 히든 카드(7번째)는 눌러야 펼쳐 본다. 판이 바뀌면 다시 덮는다
  const [peeked, setPeeked] = useState(false);
  useEffect(() => {
    setPick(null);
    setPeeked(false);
  }, [handKey]);

  const legal = view.legalActions;
  const call = legal.find((a) => a.type === 'call');
  const myCardsAll = me?.cards ?? [];
  const hiddenLastUnseen = !finished && !peeked && myCardsAll.length > HIDDEN_LAST;
  // 아직 안 본 히든 카드는 족보 계산에도 넣지 않는다 (안 본 카드가 족보 이름으로 새지 않도록)
  const knownCards = myCardsAll.filter((c, i): c is Card => c !== null && !(hiddenLastUnseen && i === HIDDEN_LAST));

  const sentence = finished ? (
    '판이 끝났습니다'
  ) : choosing ? (
    myTurn ? (
      pick === null ? '펼쳐 보일 카드 1장을 눌러 고르세요' : `${cardName(myCardsAll[pick] ?? null)}을(를) 펼칠까요?`
    ) : me?.openChosen ? (
      '다른 사람이 고르는 중입니다. 모두 고르면 한꺼번에 펼쳐집니다'
    ) : (
      `${toAct?.name ?? ''} 님이 펼칠 카드를 고르는 중입니다`
    )
  ) : myTurn ? (
    call ? (
      <>
        콜 <strong className="text-[18px] text-ivory">{won(call.amount)}</strong> 하면 계속
      </>
    ) : (
      '베팅을 골라 주세요'
    )
  ) : toAct ? (
    `${toAct.name} 님 차례입니다`
  ) : (
    ''
  );

  /** 내 카드 한 장의 표시 상태 */
  const myCardRole = (i: number): 'pickable' | 'hidden' | 'open' | 'chosen' | 'peek' => {
    if (choosing) {
      if (myTurn) return 'pickable';
      return me?.openChosen && i === 2 ? 'chosen' : 'hidden';
    }
    if (i === HIDDEN_LAST && hiddenLastUnseen) return 'peek';
    return i < 2 || i === HIDDEN_LAST ? 'hidden' : 'open';
  };

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
              status={{
                folded: pv?.folded,
                allIn: pv?.allIn,
                sittingOut: Boolean(p.seat && !pv),
                winner: finished && (view.result?.chipDeltas[p.seat?.id ?? ''] ?? 0) > 0,
              }}
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
                  {choosing && (
                    <span className="mb-0.5 rounded bg-lacquer-3 px-1.5 text-[12px] font-bold whitespace-nowrap text-ivory-dim">
                      {pv.openChosen ? '골랐음' : '고르는 중'}
                    </span>
                  )}
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
      {me && <BetChips x={MY_CHIPS.x} y={MY_CHIPS.y + 40} at={MY_CHIPS} amount={me.roundBet} k={`${handKey}-${view.street}-me`} />}

      <Pot amount={view.pot} top={136} paid={finished} />
      <p className="absolute inset-x-0 top-[204px] text-center text-[13px] text-ivory-dim">
        {finished ? '' : choosing ? '처음 3장 중 펼칠 카드를 고르는 중' : `${view.street}번째 카드 베팅 · 앤티 ${won(view.ante)}`}
      </p>

      {finished && view.result && <Payout deltas={view.result.chipDeltas} placed={placed} myId={view.myId} k={`${snap.room.handNo}`} />}
      {finished && view.result && <ResultBanner top={190} lines={stud7Lines(view)} myDelta={view.myId ? view.result.chipDeltas[view.myId] : undefined} />}

      {!snap.me.isSpectator && (
        <BottomBand>
          <MyArea
            info={
              <MyLine
                name={me?.name ?? ''}
                stack={me?.stack ?? null}
                note={me ? (me.folded ? '다이했습니다' : knownCards.length ? evaluateHand(knownCards).name : undefined) : '다음 판부터 참여합니다'}
              />
            }
          >
            <MyStud7Cards
              cards={myCardsAll}
              handKey={handKey}
              folded={Boolean(me?.folded)}
              role={myCardRole}
              pick={pick}
              onPick={(i) => setPick(i)}
              onPeek={() => setPeeked(true)}
            />
          </MyArea>
          {finished ? (
            <div className="ml-auto pb-3">
              <NextHandBar nextHandAt={snap.nextHandAt} clockOffset={ctx.clockOffset} now={ctx.now} />
            </div>
          ) : choosing ? (
            <Decision sentence={sentence} remaining={myRemaining} total={turnSecs} busy={ctx.pending}>
              <ActButton
                wide
                primary={myTurn && pick !== null}
                disabled={!myTurn || pick === null}
                onClick={() => {
                  if (pick === null) return;
                  setPick(null);
                  void act({ type: 'open', cardIndex: pick });
                }}
              >
                이 카드 펼치기
              </ActButton>
            </Decision>
          ) : (
            <Decision sentence={sentence} remaining={myRemaining} total={turnSecs} busy={ctx.pending}>
              {(myTurn ? ORDER.filter((t) => legal.some((a) => a.type === t)) : (['die', 'call', 'half'] as Stud7ActionType[])).map((t) => {
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

/**
 * 내 카드. 숨긴 카드(처음 2장·7번째)와 펼친 카드를 두 묶음으로 나눠 보여 준다.
 * - 고르기 단계: 3장 중 하나를 눌러 고른다
 * - 7번째 히든 카드: 뒷면으로 받아 눌러야 펼쳐진다
 */
function MyStud7Cards({
  cards,
  handKey,
  folded,
  role,
  pick,
  onPick,
  onPeek,
}: {
  cards: Array<Card | null>;
  handKey: number;
  folded: boolean;
  role: (i: number) => 'pickable' | 'hidden' | 'open' | 'chosen' | 'peek';
  pick: number | null;
  onPick: (i: number) => void;
  onPeek: () => void;
}) {
  const indexed = cards.map((c, i) => ({ c, i, r: role(i) }));
  const choosing = indexed.some((x) => x.r === 'pickable' || x.r === 'chosen');
  const from = (i: number) => ({ x: DECK.x - 60 - i * 40, y: DECK.y - 320 });
  const delay = (i: number) => (i < 3 ? 0.1 + i * 0.3 : 0.1);

  if (choosing || cards.length <= 3) {
    return (
      <div className="flex gap-1.5" aria-label="내 카드">
        {indexed.map(({ c, i, r }) => (
          <div key={`${handKey}-me-${i}`} className="relative">
            <PlayingCard
              card={c}
              size="lg"
              selected={pick === i}
              onClick={r === 'pickable' ? () => onPick(i) : undefined}
              label={r === 'pickable' ? `${cardName(c)} 펼치기로 고르기` : undefined}
              from={from(i)}
              delay={delay(i)}
            />
            {r === 'chosen' && <CardTag>펼칠 카드</CardTag>}
            {r === 'pickable' && pick === i && <CardTag>펼칠 카드</CardTag>}
          </div>
        ))}
      </div>
    );
  }

  const hidden = indexed.filter((x) => x.r === 'hidden' || x.r === 'peek');
  const open = indexed.filter((x) => x.r === 'open');
  return (
    <div className={`flex items-end gap-3 ${folded ? 'opacity-50' : ''}`} aria-label="내 카드">
      <CardGroup label="숨긴 카드">
        <div className="flex -space-x-6">
          {hidden.map(({ c, i, r }) =>
            r === 'peek' ? (
              <div key={`${handKey}-me-${i}-peek`} className="relative">
                <PlayingCard card={null} size="lg" onClick={onPeek} label="히든 카드 펼쳐 보기" from={from(i)} delay={0.1} />
                <span className="pointer-events-none absolute inset-x-1 top-1/2 -translate-y-1/2 rounded bg-ink/85 py-1 text-center text-[12px] leading-tight font-bold text-gold">
                  눌러서
                  <br />
                  확인
                </span>
              </div>
            ) : (
              <PlayingCard key={`${handKey}-me-${i}`} card={c} size="lg" from={from(i)} delay={delay(i)} />
            ),
          )}
        </div>
      </CardGroup>
      {open.length > 0 && (
        <CardGroup label="펼친 카드">
          <div className="flex -space-x-5">
            {open.map(({ c, i }) => (
              <PlayingCard key={`${handKey}-me-${i}`} card={c} size="lg" from={from(i)} delay={delay(i)} />
            ))}
          </div>
        </CardGroup>
      )}
    </div>
  );
}

/** 카드 묶음 이름은 세로로 옆에 써서 띠 높이를 아낀다 */
function CardGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-end gap-1">
      <span className="pb-1 text-[12px] leading-none font-bold tracking-[0.15em] text-ivory-dim [writing-mode:vertical-rl]">{label}</span>
      {children}
    </div>
  );
}

/** 카드 아래쪽에 겹쳐 다는 작은 표시 */
function CardTag({ children }: { children: ReactNode }) {
  return (
    <span className="pointer-events-none absolute inset-x-1 bottom-1 rounded bg-gold py-0.5 text-center text-[12px] leading-tight font-bold whitespace-nowrap text-ink">
      {children}
    </span>
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
