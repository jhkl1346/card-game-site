import type { HulaCard } from '@card-game/game-core';
import { motion } from 'framer-motion';
import { won } from '../lib/types.js';
import { PlayingCard } from '../components/PlayingCard.js';

export interface ResultLine {
  key: string;
  title: string;
  detail: string;
  amount?: number | undefined;
  cards?: readonly HulaCard[] | undefined;
}

/** 판 결과: 누가 왜 이겼는지(족보, 팟 분배)를 근거와 함께 보여 준다 */
export function ResultBanner({ lines, myDelta, top = 206 }: { lines: ResultLine[]; myDelta?: number | undefined; top?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
      className="pearl-ring absolute left-1/2 z-10 flex w-[470px] -translate-x-1/2 flex-col gap-1 rounded-xl bg-[rgb(16_11_9/0.94)] px-3.5 py-2 shadow-[0_10px_22px_rgb(0_0_0/0.55)]"
      style={{ top }}
      role="status"
    >
      {lines.map((l) => (
        <div key={l.key} className="flex items-center gap-2 text-[13px]">
          <b className="truncate text-gold">{l.title}</b>
          {l.detail && <span className="shrink-0 text-ivory-dim">{l.detail}</span>}
          {l.cards && (
            <span className="flex gap-0.5" aria-hidden>
              {l.cards.map((c, i) => (
                <PlayingCard key={i} card={c} size="xs" />
              ))}
            </span>
          )}
          {l.amount !== undefined && <span className="ml-auto shrink-0 font-bold">{won(l.amount)}</span>}
        </div>
      ))}
      {myDelta !== undefined && (
        <p className={`text-right text-[14px] font-black ${myDelta > 0 ? 'text-gold' : myDelta < 0 ? 'text-danger' : 'text-muted'}`}>
          {myDelta === 0 ? '내 칩 변동 없음' : `내 칩 ${myDelta > 0 ? '+' : ''}${won(myDelta)}`}
        </p>
      )}
    </motion.div>
  );
}
