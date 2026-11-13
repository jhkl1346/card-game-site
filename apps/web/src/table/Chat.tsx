import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ChatMessage } from '../lib/socket.js';
import { Icon } from '../components/Icon.js';
import type { PlacedSeat } from './common.js';

/** 이모티콘 (한 번 눌러 바로 보내기) */
export const EMOTES = ['👍', '👏', '😂', '😮', '😭', '😡', '🔥', '🙏'] as const;

/** 말풍선을 띄워 두는 시간 */
const BUBBLE_MS = 4_500;

const isEmoteOnly = (text: string) => /^(\p{Extended_Pictographic}|️|‍|\s)+$/u.test(text) && Array.from(text.trim()).length <= 6;

/**
 * 자리 위 말풍선. 각 사람의 가장 최근 메시지를 잠깐 보여 준다 (테이블 무대 좌표 안에서).
 * 관전자의 말은 채팅 창에만 나온다.
 */
export function ChatBubbles({ chat, placed, myId }: { chat: ChatMessage[]; placed: PlacedSeat[]; myId: string }) {
  const [, tick] = useState(0);
  const now = Date.now();
  const latest = new Map<string, ChatMessage>();
  for (const m of chat) if (now - m.at < BUBBLE_MS) latest.set(m.userId, m);

  // 가장 먼저 사라질 말풍선에 맞춰 다시 그린다
  useEffect(() => {
    const live = chat.filter((m) => Date.now() - m.at < BUBBLE_MS);
    if (live.length === 0) return;
    const next = Math.min(...live.map((m) => m.at + BUBBLE_MS - Date.now()));
    const t = setTimeout(() => tick((n) => n + 1), Math.max(50, next));
    return () => clearTimeout(t);
  });

  const bubbles = [...latest.values()].flatMap((m) => {
    // 내 말풍선은 내 카드 오른쪽 위, 판돈·왼쪽 자리와 겹치지 않는 곳
    if (m.userId === myId) return [{ m, x: 430, y: 262, below: false }];
    const p = placed.find((s) => s.seat?.id === m.userId);
    if (!p) return [];
    // 위쪽 자리는 아래로, 옆·아래쪽 자리는 위로 띄운다
    return [{ m, x: p.x, y: p.y < 120 ? p.y + 26 : p.y - 26, below: p.y < 120 }];
  });

  return (
    <AnimatePresence>
      {bubbles.map(({ m, x, y, below }) => {
        const emote = isEmoteOnly(m.text);
        return (
          <motion.div
            key={m.id}
            initial={{ opacity: 0, scale: 0.85, y: below ? -6 : 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
            className="pointer-events-none absolute z-30 flex justify-center"
            style={{ left: Math.min(Math.max(x - 90, 6), 844 - 186), width: 180, ...(below ? { top: y } : { bottom: 390 - y }) }}
            aria-hidden
          >
            <div
              className={`max-w-full rounded-xl border border-gold/40 bg-ivory text-ink shadow-[0_6px_14px_rgb(0_0_0/0.45)] ${
                emote ? 'px-2 py-0.5 text-[26px] leading-tight' : 'line-clamp-2 px-2.5 py-1 text-[13px] leading-snug font-bold break-words'
              }`}
            >
              {m.text}
            </div>
          </motion.div>
        );
      })}
    </AnimatePresence>
  );
}

/**
 * 채팅 창 (화면 오른쪽에서 열림). 무대 크기에 묶이지 않도록 무대 밖 fixed로 그린다.
 * React가 글자를 그대로 이스케이프하므로 받은 텍스트를 HTML로 해석하지 않는다.
 */
export function ChatPanel({
  open,
  onClose,
  chat,
  myId,
  maxLength,
  send,
}: {
  open: boolean;
  onClose: () => void;
  chat: ChatMessage[];
  myId: string;
  maxLength: number;
  send: (text: string) => Promise<boolean>;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 새 메시지가 오면 맨 아래로
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.length, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const submit = async (e?: FormEvent, value = text) => {
    e?.preventDefault();
    const v = value.trim();
    if (!v || busy) return;
    setBusy(true);
    const ok = await send(v);
    setBusy(false);
    if (ok && value === text) setText('');
    inputRef.current?.focus();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          role="dialog"
          aria-label="채팅"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-y-0 right-0 z-40 flex w-[min(320px,85vw)] flex-col border-l border-gold/25 bg-lacquer-2/97 shadow-[-12px_0_30px_rgb(0_0_0/0.45)]"
        >
          <div className="flex items-center justify-between border-b border-gold/15 py-1 pr-1 pl-4">
            <h2 className="font-serif text-base font-bold text-gold">채팅</h2>
            <button type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-lg text-muted hover:text-ivory" aria-label="채팅 닫기">
              <Icon name="close" />
            </button>
          </div>

          <ol ref={listRef} className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-3 py-2" aria-live="polite">
            {chat.length === 0 ? (
              <li className="m-auto px-4 text-center text-[13px] text-muted">아직 대화가 없습니다. 채팅은 저장되지 않고 이 방에 있는 동안만 보입니다.</li>
            ) : (
              chat.map((m) => {
                const mine = m.userId === myId;
                const emote = isEmoteOnly(m.text);
                return (
                  <li key={m.id} className={`flex max-w-[88%] flex-col ${mine ? 'items-end self-end' : 'items-start'}`}>
                    {!mine && <span className="px-1 text-[12px] text-muted">{m.nickname}</span>}
                    <span
                      className={`rounded-xl break-words ${emote ? 'text-[28px] leading-tight' : `px-3 py-1.5 text-[14px] leading-snug ${mine ? 'bg-rim text-ivory' : 'bg-lacquer text-ivory'}`}`}
                    >
                      {m.text}
                    </span>
                  </li>
                );
              })
            )}
          </ol>

          <div className="flex flex-wrap gap-1 border-t border-gold/15 px-2 pt-2" role="group" aria-label="이모티콘 보내기">
            {EMOTES.map((e) => (
              <button
                key={e}
                type="button"
                disabled={busy}
                onClick={() => void submit(undefined, e)}
                className="grid h-10 w-10 place-items-center rounded-lg text-[22px] hover:bg-gold/10 disabled:opacity-40"
                aria-label={`${e} 보내기`}
              >
                {e}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="flex gap-2 p-2">
            <label htmlFor="chat-input" className="sr-only">
              메시지
            </label>
            <input
              id="chat-input"
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={maxLength}
              autoComplete="off"
              enterKeyHint="send"
              placeholder="메시지 입력"
              className="h-11 min-w-0 flex-1 rounded-lg border border-gold/25 bg-lacquer px-3 text-[15px] text-ivory placeholder:text-muted/70 focus:border-gold focus:outline-none"
            />
            <button
              type="submit"
              disabled={!text.trim() || busy}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-gold bg-rim text-gold disabled:opacity-40"
              aria-label="보내기"
            >
              <Icon name="send" className="h-5 w-5" />
            </button>
          </form>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
