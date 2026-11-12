import { isJoker, rankLabel, type HulaCard, type Suit } from '@card-game/game-core';
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

/** 무늬 SVG (직접 그린 도형, ASSETS.md 참고) */
export function SuitIcon({ suit, className }: { suit: Suit; className?: string }) {
  const common = { viewBox: '0 0 24 24', className, 'aria-hidden': true, fill: 'currentColor' } as const;
  switch (suit) {
    case 'H':
      return (
        <svg {...common}>
          <path d="M12 21.2s-7.6-4.7-9.7-9.4C.7 8.2 3 4.4 6.7 4.4c2.2 0 3.7 1.2 5.3 3.2 1.6-2 3.1-3.2 5.3-3.2 3.7 0 6 3.8 4.4 7.4-2.1 4.7-9.7 9.4-9.7 9.4z" />
        </svg>
      );
    case 'D':
      return (
        <svg {...common}>
          <path d="M12 1.8 20.2 12 12 22.2 3.8 12z" />
        </svg>
      );
    case 'S':
      return (
        <svg {...common}>
          <path d="M12 1.8C9 6.4 2.8 9.4 2.8 14c0 2.8 2.2 4.7 4.7 4.7 1.6 0 2.9-.7 3.7-1.8-.3 2-1.2 3.7-2.7 4.9h7c-1.5-1.2-2.4-2.9-2.7-4.9.8 1.1 2.1 1.8 3.7 1.8 2.5 0 4.7-1.9 4.7-4.7 0-4.6-6.2-7.6-9.2-12.2z" />
        </svg>
      );
    case 'C':
      return (
        <svg {...common}>
          <circle cx="12" cy="6.6" r="4.3" />
          <circle cx="6.6" cy="13.4" r="4.3" />
          <circle cx="17.4" cy="13.4" r="4.3" />
          <path d="M10.9 12.5h2.2c.2 3.6 1.2 6.3 3.2 8.7H7.7c2-2.4 3-5.1 3.2-8.7z" />
        </svg>
      );
  }
}

const SIZES = {
  xs: { box: 'w-[22px] h-[31px] rounded-[3px]', rank: 'text-[11px] left-[2px] top-[1px]', small: 'w-[8px] h-[8px] left-[2px] top-[13px]', big: 'w-[11px] h-[11px] right-[2px] bottom-[2px]' },
  sm: { box: 'w-[34px] h-[48px] rounded-[5px]', rank: 'text-[13px] left-[3px] top-[2px]', small: 'w-[9px] h-[9px] left-[4px] top-[17px]', big: 'w-[15px] h-[15px] right-[3px] bottom-[3px]' },
  md: { box: 'w-[46px] h-[64px] rounded-[6px]', rank: 'text-[16px] left-[5px] top-[3px]', small: 'w-[11px] h-[11px] left-[5px] top-[22px]', big: 'w-[22px] h-[22px] right-[5px] bottom-[5px]' },
  lg: { box: 'w-[62px] h-[86px] rounded-[7px]', rank: 'text-[20px] left-[6px] top-[4px]', small: 'w-[14px] h-[14px] left-[6px] top-[28px]', big: 'w-[30px] h-[30px] right-[6px] bottom-[6px]' },
} as const;

export type CardSize = keyof typeof SIZES;

interface Props {
  /** null이면 뒷면 */
  card: HulaCard | null;
  size?: CardSize;
  className?: string;
  /** 나만 보는 카드 표시 (7포커의 숨긴 카드) */
  hiddenMark?: boolean;
  selected?: boolean;
  dim?: boolean;
  onClick?: () => void;
  /** 눌렀다 안 눌렀다 바뀌는 카드는 true로 둔다. 태그가 바뀌어 다시 그려지며 날아오는 애니메이션이 반복되는 것을 막는다 */
  asButton?: boolean;
  /** 처음 나타날 때 날아오는 방향 (덱 위치 기준 px) */
  from?: { x: number; y: number };
  delay?: number;
  label?: string;
  children?: ReactNode;
}

const RED: Suit[] = ['H', 'D'];

export function cardName(card: HulaCard | null): string {
  if (!card) return '뒷면 카드';
  if (isJoker(card)) return `조커 ${card.joker}`;
  const suit = { S: '스페이드', H: '하트', D: '다이아', C: '클로버' }[card.suit];
  return `${suit} ${rankLabel(card.rank)}`;
}

/** 직접 그린 카드 한 장. 앞면이 처음 보이면 뒤집히는 애니메이션을 한다 */
export function PlayingCard({ card, size = 'md', className = '', hiddenMark, selected, dim, onClick, asButton, from, delay = 0, label }: Props) {
  const s = SIZES[size];
  const faceKey = card ? (isJoker(card) ? `JK${card.joker}` : `${card.rank}${card.suit}`) : 'back';
  const initial = from ? { x: from.x, y: from.y, opacity: 0, rotate: -8 } : { opacity: 0, y: -6 };
  const isButton = Boolean(onClick) || Boolean(asButton);
  const Tag = isButton ? motion.button : motion.div;

  return (
    <Tag
      type={isButton ? 'button' : undefined}
      disabled={isButton && !onClick ? true : undefined}
      onClick={onClick}
      aria-label={label ?? cardName(card)}
      aria-pressed={onClick ? Boolean(selected) : undefined}
      initial={initial}
      animate={{ x: 0, y: selected ? -12 : 0, opacity: dim ? 0.45 : 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32, delay }}
      className={`relative shrink-0 select-none [perspective:400px] ${s.box} ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      <motion.div
        key={faceKey}
        initial={card ? { rotateY: 90 } : false}
        animate={{ rotateY: 0 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1], delay: from ? delay + 0.18 : delay }}
        className={`absolute inset-0 overflow-hidden ${s.box} shadow-[0_3px_6px_rgb(0_0_0/0.45)] ${
          card ? 'bg-ivory' : 'lacquer-back border-[2.5px] border-ivory'
        } ${selected ? 'ring-2 ring-gold ring-offset-1 ring-offset-lacquer' : ''}`}
      >
        {card && !isJoker(card) && (
          <span className={RED.includes(card.suit) ? 'text-suit-red' : 'text-ink'}>
            <span className={`absolute font-black leading-none ${s.rank}`}>{rankLabel(card.rank)}</span>
            <SuitIcon suit={card.suit} className={`absolute ${s.small}`} />
            <SuitIcon suit={card.suit} className={`absolute ${s.big}`} />
          </span>
        )}
        {card && isJoker(card) && (
          <span className="absolute inset-0 flex flex-col items-center justify-center text-suit-red">
            <svg viewBox="0 0 24 24" className="h-1/3 w-1/2" fill="currentColor" aria-hidden>
              <path d="M12 2.5l2.6 6.1 6.6.5-5 4.3 1.6 6.4L12 16.3 6.2 19.8l1.6-6.4-5-4.3 6.6-.5z" />
            </svg>
            <span className="mt-0.5 text-[10px] font-black tracking-tight">JOKER</span>
          </span>
        )}
      </motion.div>
      {/* 숨긴 카드 표시는 카드 위쪽 바깥에 달아 무늬를 가리지 않고, 겹쳐 놓아도 보이게 한다 */}
      {hiddenMark && (
        <span className="absolute -top-[18px] left-0 rounded-[3px] bg-ink/85 px-[3px] text-[12px] leading-[16px] font-bold text-gold">숨김</span>
      )}
    </Tag>
  );
}
