/** 직접 그린 선 아이콘 (1.8 굵기, 24 격자). ASSETS.md 참고 */
const PATHS = {
  book: 'M4 5.5C4 4.7 4.7 4 5.5 4H11v15H5.5A1.5 1.5 0 0 1 4 17.5zM20 5.5c0-.8-.7-1.5-1.5-1.5H13v15h5.5c.8 0 1.5-.7 1.5-1.5z',
  exit: 'M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10',
  close: 'M6 6l12 12M18 6 6 18',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20c1.2-3.5 4-5 7.5-5s6.3 1.5 7.5 5',
  bot: 'M6 9h12v9H6zM12 5v4M9 13h.01M15 13h.01M9.5 16h5M3.5 12v3M20.5 12v3',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5.5 11h13v9h-13z',
  crown: 'M4 17 3 7l5 4 4-6 4 6 5-4-1 10z',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  bolt: 'M13 3 5 14h6l-1 7 8-11h-6z',
  door: 'M5 21V4h10v17M15 6h4v15M11 13h.01',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  chair: 'M7 4h10v7H7zM6 11h12v3H6zM7 14v6M17 14v6',
  signal: 'M4 18h.01M8 18v-4M12 18v-8M16 18V7M20 18V4',
  chat: 'M4 5h16v11H9.5L5 20v-4H4z',
  send: 'M4 12 20 4l-5.5 16-3.2-6.8z',
  soundOn: 'M4 9.5h3.5L12 6v12l-4.5-3.5H4zM15.5 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10',
  soundOff: 'M4 9.5h3.5L12 6v12l-4.5-3.5H4zM16 10l4 4M20 10l-4 4',
  back: 'M15 5l-7 7 7 7',
  chart: 'M5 20V11M12 20V5M19 20v-6M3.5 20h17',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  );
}

/** 칩 그림 (금색 테두리의 붉은 칠 원) */
export function ChipMark({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden>
      <circle cx="8" cy="8" r="7.5" fill="#e2c27d" />
      <circle cx="8" cy="8" r="5.6" fill="#7a1f22" />
      <circle cx="8" cy="8" r="2.6" fill="#e2c27d" />
    </svg>
  );
}
