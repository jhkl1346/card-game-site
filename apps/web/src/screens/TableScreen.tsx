import type { HulaRules, Stud7Rules } from '@card-game/game-core';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import type { GameSocket } from '../lib/socket.js';
import { won, type InRoomSnapshot } from '../lib/types.js';
import { Button, Dialog } from '../components/ui.js';
import { RulesDialog } from '../components/RulesDialog.js';
import {
  BottomBand,
  LacquerTable,
  MenuItem,
  MyInfo,
  SeatPlate,
  Stage,
  TopBar,
  placeSeats,
  remainingMs,
  useNow,
  type PlacedSeat,
} from '../table/common.js';
import { HoldemTable } from '../table/HoldemTable.js';
import { Stud7Table } from '../table/Stud7Table.js';
import { HulaTable } from '../table/HulaTable.js';

export interface TableContext {
  snap: InRoomSnapshot;
  placed: PlacedSeat[];
  now: number;
  clockOffset: number;
  /** 지금 차례인 사람의 남은 시간 (ms) */
  remaining: number | null;
  /** 내 차례면 남은 시간 */
  myRemaining: number | null;
  act: (action: unknown) => Promise<void>;
  seatMenu: (placed: PlacedSeat) => React.ReactNode | undefined;
  isHostSeat: (placed: PlacedSeat) => boolean;
}

export function TableScreen({ snap, socket }: { snap: InRoomSnapshot; socket: GameSocket }) {
  const [rulesOpen, setRulesOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  // 지갑에 남은 칩 (앉아 있는 동안 테이블 칩은 스냅샷으로, 지갑 쪽은 판이 바뀔 때마다 다시 받는다)
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    api
      .wallet()
      .then((w) => alive && setWalletBalance(w.balance))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [snap.room.id, snap.room.handNo]);
  const [busy, setBusy] = useState(false);
  const { emit, pushNotice, clockOffset } = socket;
  const room = snap.room;
  const game = snap.game;
  // 0.25초마다 다시 그리되, 시각은 그릴 때마다 새로 읽는다 (탭이 가려졌다 돌아와도 남은 시간이 맞도록)
  useNow(Boolean(snap.turn?.deadline || snap.nextHandAt));
  const now = Date.now();
  const remaining = remainingMs(snap.turn?.deadline, clockOffset, now);
  const myId = snap.me.userId;
  const myTurn = snap.turn?.actorId === myId;
  const placed = placeSeats(snap);
  const mySeat = snap.me.seatIndex === null ? null : room.seats[snap.me.seatIndex] ?? null;

  const act = useCallback(
    async (action: unknown) => {
      const r = await emit('game:action', { action });
      if (!r.ok) pushNotice(r.error);
    },
    [emit, pushNotice],
  );

  const call = async (event: string, payload?: unknown) => {
    setBusy(true);
    const r = await emit(event, payload);
    setBusy(false);
    if (!r.ok) pushNotice(r.error);
    return r;
  };

  const leave = async () => {
    setLeaveOpen(false);
    const r = await call('room:leave');
    if (r.ok && (r as { pending?: boolean }).pending) pushNotice('이번 판은 자동으로 마무리하고, 판이 끝나면 자리에서 일어납니다.');
  };

  const isHostSeat = (p: PlacedSeat) => p.seat?.id === room.hostId;
  const seatMenu = (p: PlacedSeat) =>
    snap.me.isHost && p.seat && !p.seat.isBot && p.seat.id !== myId ? (
      <>
        <MenuItem onClick={() => void call('room:transferHost', { userId: p.seat!.id })}>방장 넘기기</MenuItem>
        <MenuItem onClick={() => void call('room:kick', { userId: p.seat!.id })}>내보내기</MenuItem>
      </>
    ) : undefined;

  const ctx: TableContext = { snap, placed, now, clockOffset, remaining, myRemaining: myTurn ? remaining : null, act, seatMenu, isHostSeat };
  const view = game;

  return (
    <>
    <Stage>
      <LacquerTable />
      <TopBar snap={snap} holdings={walletBalance === null ? null : walletBalance + (mySeat?.stack ?? 0)} onRules={() => setRulesOpen(true)} onLeave={() => setLeaveOpen(true)} />

      {view?.gameType === 'holdem' && <HoldemTable ctx={ctx} view={view} />}
      {view?.gameType === 'stud7' && <Stud7Table ctx={ctx} view={view} />}
      {view?.gameType === 'hula' && <HulaTable ctx={ctx} view={view} />}

      {!view && (
        <>
          {placed.map((p) => (
            <SeatPlate key={p.seatIndex} placed={p} isTurn={false} remainingRatio={null} status={{}} isHost={isHostSeat(p)} menu={seatMenu(p)} />
          ))}
          <div className="absolute inset-x-0 top-[112px] text-center">
            <p className="font-serif text-[18px] font-bold text-gold">
              {room.players}/{room.maxPlayers}명이 모였습니다
            </p>
            <p className="mt-1 text-[13px] text-muted">
              {snap.me.isHost
                ? '준비가 되면 시작을 눌러 주세요. 빈자리가 있어도 2명 이상이면 시작할 수 있습니다.'
                : '방장이 게임을 시작하기를 기다리는 중입니다.'}
            </p>
            {room.code && (
              <p className="mt-2 text-[13px] text-muted">
                입장 코드 <b className="text-[16px] tracking-[0.2em] text-gold">{room.code}</b> 를 지인에게 알려 주세요.
              </p>
            )}
          </div>
        </>
      )}

      {(!view || snap.me.isSpectator) && (
        <BottomBand>
          {snap.me.isSpectator ? (
            <div className="pb-1.5 text-[13px] text-muted">
              <b className="block text-[15px] text-ivory">관전 중입니다</b>
              {room.spectatorNames.length > 0 && `관전 ${room.spectatorNames.length}명`}
            </div>
          ) : (
            <MyInfo name={mySeat?.name ?? ''} stack={mySeat?.stack ?? null} />
          )}
          <div className="ml-auto flex gap-2">
            {snap.me.isSpectator && room.seats.some((s) => s === null) && (
              <Button variant="primary" busy={busy} onClick={() => void call('room:sit')}>
                빈자리에 앉기 (시작 칩 {won(room.buyIn)})
              </Button>
            )}
            {!view && snap.me.isHost && (
              <Button variant="primary" className="min-w-36 text-base" busy={busy} onClick={() => void call('room:start')}>
                게임 시작
              </Button>
            )}
          </div>
        </BottomBand>
      )}

    </Stage>
      <RulesDialog
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        initial={room.gameType}
        {...(view?.gameType === 'stud7' ? { stud7Rules: view.rules as Stud7Rules } : {})}
        {...(view?.gameType === 'hula' ? { hulaRules: view.rules as HulaRules } : {})}
      />
      <Dialog open={leaveOpen} title="방에서 나갈까요?" onClose={() => setLeaveOpen(false)}>
        <p className="text-[15px] leading-relaxed text-muted">
          {view && view.phase !== 'finished' && !snap.me.isSpectator
            ? '판이 진행 중입니다. 지금 나가면 이번 판은 자동으로 마무리하고(다이 또는 체크), 판이 끝나면 남은 칩이 지갑으로 돌아옵니다.'
            : '자리에서 일어나 로비로 돌아갑니다. 남은 테이블 칩은 지갑으로 돌아옵니다.'}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setLeaveOpen(false)}>
            계속 있기
          </Button>
          <Button variant="primary" busy={busy} onClick={() => void leave()}>
            나가기
          </Button>
        </div>
      </Dialog>
    </>
  );
}
