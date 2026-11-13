import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { won, type InRoomSnapshot, type SeatInfo } from '../lib/types.js';
import { ChipMark, Icon } from '../components/Icon.js';

/** 테이블은 휴대폰 가로 화면(844×390)을 기준 좌표로 그리고, 화면 크기에 맞춰 통째로 늘리거나 줄인다 */
export const STAGE_W = 844;
export const STAGE_H = 390;
/** 테이블 가운데 (팟·덱 위치 기준점) */
export const CENTER = { x: 422, y: 150 };
export const DECK_POS = { x: 236, y: 150 };
/** 아래 띠 높이와, 내 베팅 칩을 놓는 자리 (테이블 아래쪽 가운데) */
export const BAND_H = 124;
export const MY_CHIPS = { x: 422, y: 246 };

export function Stage({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H, 1.9));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-6 overflow-hidden">
      <div className="relative shrink-0" style={{ width: STAGE_W * scale, height: STAGE_H * scale }}>
        <div className="absolute top-0 left-0 origin-top-left" style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${scale})` }}>
          {children}
        </div>
      </div>
      <p className="hidden px-6 text-center text-sm text-muted portrait:block">휴대폰을 가로로 돌리면 테이블을 더 크게 볼 수 있습니다.</p>
    </div>
  );
}

/** 0.25초마다 다시 그려 남은 시간을 갱신한다 */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export function remainingMs(deadline: number | null | undefined, clockOffset: number, now: number): number | null {
  if (!deadline) return null;
  return Math.max(0, deadline - (now + clockOffset));
}

/** 옻칠 교자상: 붉은 칠 테두리, 안쪽 자개 띠, 네 귀퉁이 자개 마름모 */
export function LacquerTable() {
  return (
    <>
      <div
        className="absolute rounded-[26px] shadow-[0_0_0_7px_var(--color-rim),0_0_0_9px_var(--color-rim-deep),0_14px_22px_rgb(0_0_0/0.55)]"
        style={{ left: 96, top: 58, width: 652, height: 206, background: 'radial-gradient(ellipse at 50% 35%, var(--color-lacquer-2), var(--color-lacquer) 70%)' }}
      >
        <div className="pearl-ring absolute inset-3 rounded-2xl" />
      </div>
      {[
        [118, 80],
        [710, 80],
        [118, 226],
        [710, 226],
      ].map(([l, t]) => (
        <div key={`${l}-${t}`} className="pearl-fill absolute h-4 w-4 rotate-45 opacity-85" style={{ left: l, top: t }} aria-hidden />
      ))}
    </>
  );
}

/** 다른 사람 자리 배치 (중심 좌표). 나는 아래 띠에 따로 그린다 */
const LAYOUTS: Record<number, Array<[number, number]>> = {
  0: [],
  1: [[422, 66]],
  2: [
    [262, 66],
    [582, 66],
  ],
  3: [
    [72, 160],
    [422, 66],
    [772, 160],
  ],
  4: [
    [72, 176],
    [262, 66],
    [582, 66],
    [772, 176],
  ],
  5: [
    [72, 196],
    [212, 66],
    [422, 66],
    [632, 66],
    [772, 196],
  ],
  6: [
    [72, 206],
    [72, 118],
    [302, 66],
    [542, 66],
    [772, 118],
    [772, 206],
  ],
  7: [
    [72, 206],
    [72, 118],
    [232, 66],
    [422, 66],
    [612, 66],
    [772, 118],
    [772, 206],
  ],
  8: [
    [72, 210],
    [72, 124],
    [204, 66],
    [344, 66],
    [500, 66],
    [640, 66],
    [772, 124],
    [772, 210],
  ],
};

export interface PlacedSeat {
  seatIndex: number;
  seat: SeatInfo | null;
  x: number;
  y: number;
}

/** 내 자리를 기준으로 시계 방향으로 돌려 다른 자리를 배치한다 (빈자리도 포함) */
export function placeSeats(snap: InRoomSnapshot): PlacedSeat[] {
  const seats = snap.room.seats;
  const n = seats.length;
  const mine = snap.me.seatIndex;
  const order: number[] = [];
  for (let k = 1; k <= n; k++) {
    const idx = mine === null ? (k - 1) % n : (mine + k) % n;
    if (idx !== mine) order.push(idx);
  }
  const layout = LAYOUTS[order.length] ?? LAYOUTS[8]!;
  return order.map((seatIndex, i) => ({ seatIndex, seat: seats[seatIndex] ?? null, x: layout[i]![0], y: layout[i]![1] }));
}

export function TopBar({
  snap,
  holdings,
  onRules,
  onLeave,
  extra,
  tools,
}: {
  snap: InRoomSnapshot;
  /** 보유 칩 합계 (지갑 + 지금 테이블 칩) */
  holdings: number | null;
  onRules: () => void;
  onLeave: () => void;
  extra?: ReactNode;
  /** 오른쪽 버튼 앞에 놓을 도구 (채팅, 소리) */
  tools?: ReactNode;
}) {
  const r = snap.room;
  return (
    <div className="absolute inset-x-0 top-0 flex h-[38px] items-center gap-3 bg-[rgb(14_10_8/0.78)] px-3 text-[13px]">
      <h1 className="truncate font-serif text-[15px] font-bold text-gold">
        {r.gameName} · {r.title}
      </h1>
      <span className="shrink-0 text-muted">
        {r.stakeLabel} {won(r.stake)}
      </span>
      {r.handNo > 0 && <span className="shrink-0 text-muted">{r.handNo}번째 판</span>}
      {r.code && r.seats.some((s) => s === null) && (
        <span className="shrink-0 rounded bg-lacquer-3 px-2 py-0.5 text-muted">
          코드 <b className="tracking-wider text-gold">{r.code}</b>
        </span>
      )}
      {extra}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {holdings !== null && (
          <span className="flex items-center gap-1">
            <span className="text-muted">보유</span>
            <ChipMark className="h-3.5 w-3.5" />
            <b>{won(holdings)}</b>
          </span>
        )}
        {tools}
        <button type="button" onClick={onRules} className="relative flex h-[30px] items-center gap-1 rounded-md border border-gold/45 px-2.5 before:absolute before:inset-x-0 before:-inset-y-[7px] before:content-[''] text-[12px] font-bold text-gold hover:bg-gold/10">
          <Icon name="book" className="h-3.5 w-3.5" />
          족보
        </button>
        <button type="button" onClick={onLeave} className="relative flex h-[30px] items-center gap-1 rounded-md border border-gold/45 px-2.5 before:absolute before:inset-x-0 before:-inset-y-[7px] before:content-[''] text-[12px] font-bold text-gold hover:bg-gold/10">
          <Icon name="exit" className="h-3.5 w-3.5" />
          나가기
        </button>
      </div>
    </div>
  );
}

export interface SeatStatus {
  folded?: boolean;
  allIn?: boolean;
  /** 이 판에 참여하지 않음 (중간에 앉음) */
  sittingOut?: boolean;
  foldLabel?: string;
  note?: string;
  /** 판이 끝나고 칩을 따 간 자리 */
  winner?: boolean;
}

/** 다른 사람 자리: 자개 원판 아바타 + 이름 + 칩 */
export function SeatPlate({
  placed,
  isTurn,
  remainingRatio,
  status,
  isHost,
  badge,
  children,
  menu,
}: {
  placed: PlacedSeat;
  isTurn: boolean;
  remainingRatio: number | null;
  status: SeatStatus;
  isHost: boolean;
  badge?: ReactNode;
  children?: ReactNode;
  menu?: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { seat } = placed;
  const style = { left: placed.x - 63, top: placed.y - 22 };
  if (!seat) {
    return (
      <div className="absolute flex h-11 w-[126px] items-center justify-center rounded-full border border-dashed border-gold/25 text-[12px] text-muted" style={style}>
        빈자리
      </div>
    );
  }
  const away = !seat.isBot && (!seat.connected || seat.botControlled);
  const tag = status.allIn ? '올인' : status.folded ? (status.foldLabel ?? '다이') : seat.leaving ? '나가는 중' : away ? '자리 비움' : status.sittingOut ? '다음 판부터' : null;
  const deg = remainingRatio === null ? 360 : Math.round(remainingRatio * 360);
  return (
    <div className="absolute w-[126px]" style={style}>
      <motion.div
        animate={{ y: isTurn ? -3 : 0 }}
        className={`relative flex h-11 items-center gap-2 rounded-full border bg-[rgb(16_11_9/0.94)] py-1 pr-2.5 pl-1 ${
          isTurn || status.winner ? 'border-gold shadow-[0_6px_14px_rgb(0_0_0/0.5)]' : 'border-gold/25'
        } ${status.folded || status.sittingOut ? 'opacity-50' : ''}`}
      >
        <button
          type="button"
          disabled={!menu}
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menu ? `${seat.name} 님 관리` : undefined}
          className="relative grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full"
          style={isTurn ? { background: `conic-gradient(var(--color-gold) 0deg ${deg}deg, #3a2d24 ${deg}deg 360deg)` } : undefined}
        >
          <span className={`grid h-[30px] w-[30px] place-items-center rounded-full font-serif text-[14px] font-bold text-ink ${status.folded ? 'bg-[#6d6258]' : 'pearl-fill'}`}>
            {seat.isBot ? <Icon name="bot" className="h-4 w-4" /> : Array.from(seat.name)[0]}
          </span>
        </button>
        <div className="min-w-0 leading-tight">
          <b className="flex items-center gap-1 truncate text-[14px]">
            {isHost && <Icon name="crown" className="h-3 w-3 shrink-0 text-gold" />}
            <span className="truncate">{seat.name}</span>
          </b>
          <span className="block truncate text-[13px] text-muted">
            {tag && <b className={status.allIn ? 'text-gold' : 'text-ivory'}>{tag} · </b>}
            {/* 차례는 타이머 고리와 아래 문장으로 알리고, 여기서는 칩만 금색으로 */}
            <span className={isTurn ? 'font-bold text-gold' : undefined}>{won(seat.stack)}</span>
          </span>
        </div>
        {badge}
      </motion.div>
      {children}
      <AnimatePresence>
        {menuOpen && menu && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute top-12 left-0 z-30 flex flex-col overflow-hidden rounded-lg border border-gold/40 bg-lacquer shadow-[0_8px_18px_rgb(0_0_0/0.5)]"
            onClick={() => setMenuOpen(false)}
          >
            {menu}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function MenuItem({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="min-h-11 px-4 text-left text-[13px] font-bold whitespace-nowrap hover:bg-lacquer-3">
      {children}
    </button>
  );
}

/** 자리 앞에 놓인 이번 라운드 베팅 칩. 라운드가 끝나면 판돈 쪽으로 미끄러져 사라진다 */
export function BetChips({ x, y, amount, k, at }: { x: number; y: number; amount: number; k: string; at?: { x: number; y: number } }) {
  // 위쪽 자리는 가운데로 끌어오면 판돈 글자와 겹치므로 자리 옆(가운데 쪽)에 놓는다. at이 있으면 그 자리에 놓는다
  const top = y < CENTER.y - 60;
  const bx = at?.x ?? (top ? x + (x > CENTER.x + 20 ? -84 : 84) : x + (CENTER.x - x) * 0.4);
  const by = at?.y ?? (top ? y + 30 : y + (CENTER.y - y) * 0.45);
  return (
    <AnimatePresence>
      {amount > 0 && (
        <motion.div
          key={k}
          initial={{ opacity: 0, x: x - bx, y: y - by, scale: 0.6 }}
          animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
          exit={{ opacity: 0, x: CENTER.x - bx, y: CENTER.y - 40 - by, scale: 0.7 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full bg-[rgb(0_0_0/0.35)] py-0.5 pr-2 pl-0.5 text-[12px] font-bold text-gold"
          style={{ left: bx, top: by }}
        >
          <ChipMark />
          {won(amount)}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** 판돈 표시. x를 주면 그 x를 가운데로 하는 좁은 칸에, 없으면 테이블 가운데에 놓는다 */
export function Pot({ amount, label = '판 돈', top = 96, x, paid = false }: { amount: number; label?: string; top?: number; x?: number; paid?: boolean }) {
  return (
    <div
      className={`absolute text-center transition-opacity duration-500 ${x === undefined ? 'inset-x-0' : ''} ${paid ? 'opacity-30' : ''}`}
      style={x === undefined ? { top } : { top, left: x - 70, width: 140 }}
    >
      <small className="font-serif text-[13px] tracking-[0.2em] text-gold">{label}</small>
      <motion.div key={amount} initial={{ scale: 1.12 }} animate={{ scale: 1 }} transition={{ duration: 0.3 }} className="text-[28px] leading-none font-black">
        {won(amount)}
      </motion.div>
    </div>
  );
}

/**
 * 판이 끝나면 딴 칩이 가운데에서 이긴 사람 자리로 미끄러져 간다 (나는 아래 띠 쪽).
 * 칩 변화가 플러스인 사람만 받는 사람으로 본다.
 */
export function Payout({ deltas, placed, myId, k }: { deltas: Record<string, number>; placed: PlacedSeat[]; myId: string | null | undefined; k: string }) {
  const targets = Object.entries(deltas).flatMap(([id, amount]) => {
    if (amount <= 0) return [];
    const p = placed.find((s) => s.seat?.id === id);
    const to = id === myId ? { x: 300, y: STAGE_H - 50 } : p ? { x: p.x, y: p.y } : null;
    return to ? [{ id, amount, to }] : [];
  });
  return (
    <>
      {targets.map((t) => (
        <motion.div
          key={`${k}-${t.id}`}
          initial={{ left: CENTER.x, top: CENTER.y - 20, opacity: 0, scale: 0.8 }}
          animate={{ left: t.to.x, top: t.to.y, opacity: [0, 1, 1, 0], scale: 1 }}
          transition={{ duration: 1.3, ease: [0.16, 1, 0.3, 1], delay: 0.2, opacity: { duration: 1.6, times: [0, 0.15, 0.75, 1], delay: 0.2 } }}
          className="pointer-events-none absolute z-20 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full bg-[rgb(0_0_0/0.55)] py-0.5 pr-2 pl-0.5 text-[13px] font-black text-gold"
          aria-hidden
        >
          <ChipMark />+{won(t.amount)}
        </motion.div>
      ))}
    </>
  );
}

/** 아래 띠: 왼쪽에 내 정보 한 줄과 내 카드, 오른쪽에 결정 문장과 버튼 */
export function BottomBand({ children }: { children: ReactNode }) {
  return (
    <div
      className="absolute inset-x-0 bottom-0 flex items-end gap-3 bg-gradient-to-b from-transparent to-[rgb(10_7_5/0.94)] to-30% px-3.5 pb-2.5"
      style={{ height: BAND_H }}
    >
      {children}
    </div>
  );
}

/** 아래 띠 왼쪽: 내 정보 한 줄 + 내 카드 */
export function MyArea({ info, children, extra }: { info: ReactNode; children: ReactNode; extra?: ReactNode }) {
  return (
    <div className="flex min-w-0 shrink-0 flex-col gap-1">
      <div className="pointer-events-none relative z-10 flex w-fit items-center gap-2 rounded-md bg-ink/75 pr-2 text-[13px] text-muted">{info}</div>
      <div className="flex items-end gap-2.5">
        {children}
        {extra}
      </div>
    </div>
  );
}

/** 내 정보 한 줄: 이름 · 테이블 칩 · 덧붙일 말(족보 등) */
export function MyLine({ name, stack, note }: { name: string; stack: number | null; note?: ReactNode }) {
  return (
    <>
      <b className="text-[14px] text-ivory">{name} (나)</b>
      {stack !== null && (
        <span>
          테이블 <b className="text-gold">{won(stack)}</b>
        </span>
      )}
      {note && <span className="rounded bg-lacquer-3/80 px-1.5 py-px font-bold text-ivory">{note}</span>}
    </>
  );
}

export function Decision({
  sentence,
  remaining,
  total,
  children,
  busy = false,
}: {
  sentence: ReactNode;
  remaining: number | null;
  total: number;
  children?: ReactNode;
  /** 보낸 액션의 응답을 기다리는 중이면 버튼을 잠근다 (두 번 눌림 방지) */
  busy?: boolean;
}) {
  const ratio = remaining === null ? 0 : Math.min(1, remaining / (total * 1000));
  return (
    <div className="ml-auto flex min-w-0 flex-col items-end">
      <p className="mb-1.5 text-right text-[14px] text-ivory-dim" aria-live="polite">
        {sentence}
        {remaining !== null && (
          <>
            {' '}
            · 남은 <strong className="text-[18px] text-ivory">{Math.ceil(remaining / 1000)}초</strong>
          </>
        )}
      </p>
      {remaining !== null && (
        <div className="mb-2 h-1 w-full rounded-full bg-[#3a2d24]" aria-hidden>
          <div className={`h-full rounded-full transition-[width] duration-200 ${ratio < 0.25 ? 'bg-danger' : 'bg-gold'}`} style={{ width: `${ratio * 100}%` }} />
        </div>
      )}
      <fieldset disabled={busy} className={`flex gap-2 transition-opacity ${busy ? 'opacity-70' : ''}`}>
        {children}
      </fieldset>
    </div>
  );
}

export function ActButton({
  onClick,
  children,
  sub,
  primary,
  disabled,
  wide,
  compact,
}: {
  onClick: () => void;
  children: ReactNode;
  sub?: ReactNode;
  primary?: boolean;
  disabled?: boolean;
  wide?: boolean;
  compact?: boolean;
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-[46px] flex-col items-center justify-center rounded-lg border leading-tight font-bold disabled:opacity-35 ${wide ? 'min-w-[88px] px-3' : compact ? 'min-w-[60px] px-2' : 'min-w-[72px] px-3'} ${
        primary ? 'border-gold bg-rim text-gold hover:bg-[#8d2629]' : 'border-gold/30 bg-lacquer-3 text-ivory hover:border-gold/60'
      }`}
    >
      <span className="text-[15px]">{children}</span>
      {sub !== undefined && <span className="text-[12px] font-bold opacity-85">{sub}</span>}
    </motion.button>
  );
}

/** 판 사이 안내 (다음 판까지 남은 시간) */
export function NextHandBar({ nextHandAt, clockOffset, now }: { nextHandAt: number | null; clockOffset: number; now: number }) {
  const left = remainingMs(nextHandAt, clockOffset, now);
  if (left === null) return null;
  return <span className="text-[13px] text-muted">다음 판까지 {Math.ceil(left / 1000)}초</span>;
}
