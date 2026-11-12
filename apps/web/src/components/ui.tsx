import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Icon } from './Icon.js';

type Variant = 'primary' | 'quiet' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-rim text-gold border border-gold hover:bg-[#8d2629] active:bg-rim-deep',
  quiet: 'bg-lacquer-3 text-ivory border border-gold/30 hover:border-gold/60 hover:bg-[#3a2c24]',
  ghost: 'bg-transparent text-gold border border-gold/45 hover:bg-gold/10',
  danger: 'bg-transparent text-danger border border-danger/50 hover:bg-danger/10',
};

export function Button({
  variant = 'quiet',
  className = '',
  busy,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-4 font-bold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
    >
      {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  error,
  ok,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  ok?: string | null;
  children: (id: string, describedBy: string | undefined) => ReactNode;
}) {
  const id = useId();
  const msgId = `${id}-msg`;
  const message = error ?? ok ?? hint;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-bold text-ivory">
        {label}
      </label>
      {children(id, message ? msgId : undefined)}
      {message ? (
        <p id={msgId} className={`text-[13px] leading-snug ${error ? 'text-danger' : ok ? 'text-ok' : 'text-muted'}`} role={error ? 'alert' : undefined}>
          {message}
        </p>
      ) : null}
    </div>
  );
}

export const inputClass =
  'h-11 w-full rounded-lg border border-gold/25 bg-lacquer px-3 text-[15px] text-ivory placeholder:text-muted/70 focus:border-gold focus:outline-none aria-[invalid=true]:border-danger';

/** 가운데 뜨는 창. 바깥을 누르거나 Esc로 닫는다 */
export function Dialog({
  open,
  title,
  onClose,
  children,
  wide,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-floor-deep/75 p-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={{ y: 16, opacity: 0, filter: 'blur(4px)' }}
            animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
            exit={{ y: 8, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className={`pearl-ring flex max-h-full w-full flex-col rounded-2xl bg-lacquer-2 shadow-[0_18px_40px_rgb(0_0_0/0.55)] outline-none ${
              wide ? 'max-w-3xl' : 'max-w-md'
            }`}
          >
            <div className="flex items-center justify-between gap-3 border-b border-gold/15 px-5 py-3">
              <h2 id={titleId} className="font-serif text-lg font-bold text-gold">
                {title}
              </h2>
              <button type="button" onClick={onClose} className="-mr-2 grid h-11 w-11 place-items-center rounded-lg text-muted hover:text-ivory" aria-label="닫기">
                <Icon name="close" />
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** 숫자 증감 입력 (휴대폰에서 누르기 쉽게 +/- 버튼) */
export function Stepper({
  value,
  onChange,
  min,
  max,
  step,
  id,
  describedBy,
  format = (n) => n.toLocaleString('ko-KR'),
}: {
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step: number;
  id?: string;
  describedBy?: string | undefined;
  format?: (n: number) => string;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  return (
    <div className="flex items-center gap-2">
      <button type="button" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-gold/30 bg-lacquer-3 text-gold disabled:opacity-35" onClick={() => onChange(clamp(value - step))} disabled={value <= min} aria-label="줄이기">
        <Icon name="minus" />
      </button>
      <output id={id} aria-describedby={describedBy} className="min-w-20 flex-1 text-center text-[17px] font-bold">
        {format(value)}
      </output>
      <button type="button" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-gold/30 bg-lacquer-3 text-gold disabled:opacity-35" onClick={() => onChange(clamp(value + step))} disabled={value >= max} aria-label="늘리기">
        <Icon name="plus" />
      </button>
    </div>
  );
}

export function Toasts({ notices, onDismiss }: { notices: Array<{ id: number; message: string }>; onDismiss: (id: number) => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-12 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
      <AnimatePresence>
        {notices.map((n) => (
          <motion.button
            type="button"
            key={n.id}
            onClick={() => onDismiss(n.id)}
            initial={{ y: -12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-auto max-w-md rounded-lg border border-gold/40 bg-lacquer/95 px-4 py-2.5 text-sm text-ivory shadow-[0_8px_20px_rgb(0_0_0/0.45)]"
          >
            {n.message}
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
