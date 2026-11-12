import { useEffect, useState } from 'react';
import { GAME_INFO, MIN_BUYIN_MULTIPLIER, TURN_SECONDS, won, type GameType, type RoomSettingsInput } from '../lib/types.js';
import { Button, Dialog, Field, Stepper } from './ui.js';

const STAKE_STEPS: Record<GameType, number> = { stud7: 10, holdem: 20, hula: 10 };

/**
 * 방 설정. single=true면 혼자 하기(빈자리는 모두 봇, 비공개)라 봇 수·공개 여부를 묻지 않는다.
 * 봇 난이도는 고정이므로 선택 항목이 없다.
 */
export function RoomSettingsDialog({
  open,
  gameType,
  single,
  balance,
  onClose,
  onSubmit,
}: {
  open: boolean;
  gameType: GameType;
  single: boolean;
  balance: number;
  onClose: () => void;
  onSubmit: (settings: RoomSettingsInput) => Promise<string | null>;
}) {
  const info = GAME_INFO[gameType];
  const [s, setS] = useState<RoomSettingsInput>({ ...info.defaults, isPrivate: false, turnSeconds: TURN_SECONDS.default });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setS({ ...GAME_INFO[gameType].defaults, isPrivate: false, turnSeconds: TURN_SECONDS.default });
      setError(null);
    }
  }, [open, gameType]);

  const set = <K extends keyof RoomSettingsInput>(key: K, value: RoomSettingsInput[K]) =>
    setS((prev) => {
      const next = { ...prev, [key]: value };
      if (next.botCount > next.maxPlayers - 1) next.botCount = next.maxPlayers - 1;
      const minBuy = next.stake * MIN_BUYIN_MULTIPLIER;
      if (next.buyIn < minBuy) next.buyIn = minBuy;
      return next;
    });

  const minBuyIn = s.stake * MIN_BUYIN_MULTIPLIER;
  const sitWith = Math.min(s.buyIn, balance);
  const short = balance < minBuyIn;

  const submit = async () => {
    setBusy(true);
    setError(await onSubmit(single ? { ...s, botCount: s.maxPlayers - 1, isPrivate: true } : s));
    setBusy(false);
  };

  return (
    <Dialog open={open} title={`${info.name} ${single ? '혼자 하기' : '방 만들기'}`} onClose={onClose} wide>
      <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2 md:grid-cols-3 landscape:max-md:grid-cols-3">
        <Field label="인원" hint={`${info.min}~${info.max}명 (나 포함)`}>
          {(id, d) => <Stepper id={id} describedBy={d} value={s.maxPlayers} min={info.min} max={info.max} step={1} onChange={(v) => set('maxPlayers', v)} format={(n) => `${n}명`} />}
        </Field>
        {single ? (
          <Field label="봇" hint="빈자리는 모두 봇이 앉습니다. 봇 난이도는 하나로 고정입니다.">
            {(id) => (
              <output id={id} className="flex h-11 items-center text-[17px] font-bold">
                {s.maxPlayers - 1}명
              </output>
            )}
          </Field>
        ) : (
          <Field label="처음에 채울 봇" hint="나중에 사람이 들어오면 빈자리에 앉습니다.">
            {(id, d) => <Stepper id={id} describedBy={d} value={s.botCount} min={0} max={s.maxPlayers - 1} step={1} onChange={(v) => set('botCount', v)} format={(n) => `${n}명`} />}
          </Field>
        )}
        <Field label={info.stakeLabel} hint={gameType === 'holdem' ? `스몰블라인드 ${won(Math.floor(s.stake / 2))}` : undefined}>
          {(id, d) => <Stepper id={id} describedBy={d} value={s.stake} min={10} max={10_000} step={STAKE_STEPS[gameType]} onChange={(v) => set('stake', v)} />}
        </Field>
        <Field label="시작 칩 (바이인)" hint={`최소 ${won(minBuyIn)} (${info.stakeLabel}의 ${MIN_BUYIN_MULTIPLIER}배)`}>
          {(id, d) => <Stepper id={id} describedBy={d} value={s.buyIn} min={minBuyIn} max={1_000_000} step={1_000} onChange={(v) => set('buyIn', v)} />}
        </Field>
        <Field label="턴 제한 시간">
          {(id, d) => <Stepper id={id} describedBy={d} value={s.turnSeconds} min={TURN_SECONDS.min} max={TURN_SECONDS.max} step={5} onChange={(v) => set('turnSeconds', v)} format={(n) => `${n}초`} />}
        </Field>
        {!single && (
          <Field label="공개 여부" hint={s.isPrivate ? '방 목록에 나오지 않고 입장 코드로만 들어옵니다.' : '방 목록에 나와 누구나 들어올 수 있습니다.'}>
            {(id, d) => (
              <div id={id} aria-describedby={d} role="radiogroup" className="grid grid-cols-2 rounded-lg bg-lacquer p-1">
                {[false, true].map((v) => (
                  <button
                    key={String(v)}
                    type="button"
                    role="radio"
                    aria-checked={s.isPrivate === v}
                    onClick={() => set('isPrivate', v)}
                    className={`min-h-10 rounded-md font-bold ${s.isPrivate === v ? 'bg-rim text-gold' : 'text-muted hover:text-ivory'}`}
                  >
                    {v ? '비공개 (코드)' : '공개'}
                  </button>
                ))}
              </div>
            )}
          </Field>
        )}
      </div>

      <p className={`mt-5 rounded-lg px-3 py-2.5 text-sm ${short ? 'bg-rim/40 text-danger' : 'bg-lacquer text-muted'}`}>
        {short
          ? `보유 칩(${won(balance)})이 최소 바이인보다 적어 앉을 수 없습니다. 판돈을 낮춰 주세요.`
          : `보유 칩 ${won(balance)} 중 ${won(sitWith)}을 가지고 앉습니다. 일어나면 남은 칩이 돌아옵니다.`}
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          취소
        </Button>
        <Button variant="primary" busy={busy} disabled={short} onClick={submit}>
          {single ? '봇과 시작하기' : '방 만들기'}
        </Button>
      </div>
    </Dialog>
  );
}
