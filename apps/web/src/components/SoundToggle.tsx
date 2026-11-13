import { playSound, setSoundEnabled, useSoundEnabled } from '../lib/sound.js';
import { Icon } from './Icon.js';

/** 소리 켜기/끄기. compact는 게임 화면 위쪽 막대용 */
export function SoundToggle({ compact }: { compact?: boolean }) {
  const on = useSoundEnabled();
  const toggle = () => {
    setSoundEnabled(!on);
    if (!on) playSound('chip');
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? '소리 끄기' : '소리 켜기'}
      title={on ? '소리 끄기' : '소리 켜기'}
      className={
        compact
          ? "relative grid h-[30px] w-[30px] place-items-center rounded-md border border-gold/45 text-gold before:absolute before:-inset-[7px] before:content-[''] hover:bg-gold/10"
          : 'grid min-h-10 w-10 place-items-center rounded-lg border border-gold/45 text-gold hover:bg-gold/10'
      }
    >
      <Icon name={on ? 'soundOn' : 'soundOff'} className={compact ? 'h-4 w-4' : 'h-5 w-5'} />
    </button>
  );
}
