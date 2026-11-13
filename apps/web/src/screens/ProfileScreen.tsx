import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { api, ApiError, type GameStat, type MyStats, type PublicUser } from '../lib/api.js';
import { GAME_INFO, won } from '../lib/types.js';
import { Button, Dialog, Field, inputClass } from '../components/ui.js';
import { ChipMark, Icon } from '../components/Icon.js';

/** 승률 (판이 없으면 -) */
export const winRate = (s: { played: number; wins: number }) => (s.played === 0 ? '-' : `${Math.round((s.wins / s.played) * 100)}%`);

/** +1,200 / -300 / 0 */
export const signed = (n: number) => (n > 0 ? `+${won(n)}` : won(n));

const deltaClass = (n: number) => (n > 0 ? 'text-ok' : n < 0 ? 'text-danger' : 'text-muted');

export function ScreenHeader({ title, onBack, children }: { title: string; onBack: () => void; children?: ReactNode }) {
  return (
    <header className="flex items-center gap-2 py-3">
      <Button variant="ghost" className="min-h-10 px-2.5 text-sm" onClick={onBack} aria-label="로비로 돌아가기">
        <Icon name="back" className="h-4 w-4" />
        로비
      </Button>
      <h1 className="font-serif text-lg font-bold text-gold">{title}</h1>
      <div className="ml-auto flex items-center gap-2">{children}</div>
    </header>
  );
}

export function ProfileScreen({
  user,
  onBack,
  onUserChange,
  onDeleted,
  notify,
}: {
  user: PublicUser;
  onBack: () => void;
  onUserChange: (user: PublicUser) => void;
  onDeleted: () => void;
  notify: (message: string) => void;
}) {
  const [stats, setStats] = useState<MyStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'stats' | 'account'>('stats');

  useEffect(() => {
    let alive = true;
    api
      .stats()
      .then((s) => alive && setStats(s))
      .catch((e) => alive && setError(e instanceof ApiError ? e.message : '전적을 불러오지 못했습니다.'));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="mx-auto flex min-h-full max-w-5xl flex-col px-4 pb-6">
      <ScreenHeader title="내 정보" onBack={onBack}>
        <span className="flex items-center gap-1.5 rounded-full bg-lacquer px-3 py-1.5 text-[15px] font-bold" aria-label={`보유 칩 ${won(user.balance)}개`}>
          <ChipMark />
          {won(user.balance)}
        </span>
      </ScreenHeader>

      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="font-serif text-2xl font-bold text-ivory">{user.nickname}</p>
        <p className="text-sm text-muted">아이디 {user.username}</p>
      </div>

      <div role="tablist" aria-label="내 정보" className="mb-3 flex gap-1 border-b border-gold/15">
        {(
          [
            ['stats', '전적'],
            ['account', '계정 관리'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`-mb-px min-h-11 border-b-2 px-4 text-[15px] font-bold transition-colors ${tab === key ? 'border-gold text-gold' : 'border-transparent text-muted hover:text-ivory'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'stats' ? (
        error ? (
          <p className="text-sm text-danger">{error}</p>
        ) : !stats ? (
          <p className="text-sm text-muted">전적을 불러오는 중입니다…</p>
        ) : (
          <StatsView stats={stats} />
        )
      ) : (
        <AccountView user={user} onUserChange={onUserChange} onDeleted={onDeleted} notify={notify} />
      )}
    </div>
  );
}

function StatsView({ stats }: { stats: MyStats }) {
  return (
    <div className="grid gap-4 md:grid-cols-[1.1fr_1fr] landscape:max-md:grid-cols-[1.1fr_1fr]">
      <section aria-labelledby="per-game" className="flex flex-col gap-2">
        <h2 id="per-game" className="sr-only">
          게임별 전적
        </h2>
        <TotalRow total={stats.total} />
        {stats.perGame.map((g) => (
          <GameRow key={g.gameType} stat={g} />
        ))}
      </section>

      <section aria-labelledby="recent" className="flex min-h-[200px] flex-col rounded-2xl bg-lacquer p-3">
        <h2 id="recent" className="mb-2 px-1 font-serif text-base font-bold text-gold">
          최근 판
        </h2>
        {stats.recent.length === 0 ? (
          <p className="flex flex-1 items-center justify-center px-4 text-center text-sm text-muted">아직 끝까지 친 판이 없습니다. 로비에서 혼자 하기로 한 판 해 보세요.</p>
        ) : (
          <ol className="flex flex-col divide-y divide-gold/10 overflow-y-auto">
            {stats.recent.map((r) => (
              <li key={r.gameId} className="flex items-center gap-3 px-1 py-2 text-sm">
                <span className="w-[86px] shrink-0 text-muted tabular-nums">
                  {new Date(r.endedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}
                </span>
                <span className="w-[5.5em] shrink-0 font-bold whitespace-nowrap">{GAME_INFO[r.gameType].name}</span>
                <span className="flex-1 text-muted">
                  {r.players}명 중 {r.rank}위
                </span>
                <span className={`font-bold tabular-nums ${deltaClass(r.chipDelta)}`}>{signed(r.chipDelta)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function TotalRow({ total }: { total: MyStats['total'] }) {
  return (
    <div className="pearl-ring flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl bg-lacquer-2 px-4 py-3">
      <span className="font-serif text-[17px] font-bold text-gold">전체</span>
      <Stat label="판" value={won(total.played)} />
      <Stat label="승리" value={won(total.wins)} />
      <Stat label="승률" value={winRate(total)} />
      <Stat label="칩 증감" value={signed(total.chipNet)} className={deltaClass(total.chipNet)} />
    </div>
  );
}

function GameRow({ stat }: { stat: GameStat }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl bg-lacquer/70 px-4 py-2.5">
      <span className="w-[5.5em] shrink-0 font-serif text-[16px] font-bold whitespace-nowrap text-ivory">{GAME_INFO[stat.gameType].name}</span>
      {stat.played === 0 ? (
        <span className="text-sm text-muted">아직 기록이 없습니다</span>
      ) : (
        <>
          <Stat label="판" value={won(stat.played)} />
          <Stat label="승률" value={winRate(stat)} />
          <Stat label="칩 증감" value={signed(stat.chipNet)} className={deltaClass(stat.chipNet)} />
          <Stat label="한 판 최고" value={stat.bestWin > 0 ? `+${won(stat.bestWin)}` : '-'} />
        </>
      )}
    </div>
  );
}

function Stat({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <span className="flex items-baseline gap-1.5 text-sm">
      <span className="text-muted">{label}</span>
      <b className={`text-[15px] tabular-nums ${className}`}>{value}</b>
    </span>
  );
}

// ── 계정 관리 ──

function AccountView({
  user,
  onUserChange,
  onDeleted,
  notify,
}: {
  user: PublicUser;
  onUserChange: (user: PublicUser) => void;
  onDeleted: () => void;
  notify: (message: string) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 landscape:max-md:grid-cols-2">
      <NicknameForm user={user} onUserChange={onUserChange} notify={notify} />
      <PasswordForm notify={notify} />
      <DeleteAccount onDeleted={onDeleted} />
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-lacquer p-4">
      <h2 className="font-serif text-base font-bold text-gold">{title}</h2>
      {children}
    </section>
  );
}

function NicknameForm({ user, onUserChange, notify }: { user: PublicUser; onUserChange: (u: PublicUser) => void; notify: (m: string) => void }) {
  const [nickname, setNickname] = useState(user.nickname);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const same = nickname.trim() === user.nickname;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (same) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.changeNickname(nickname.trim());
      onUserChange(r.user);
      notify(`닉네임을 ${r.user.nickname}(으)로 바꿨습니다.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '닉네임을 바꾸지 못했습니다.');
    }
    setBusy(false);
  };

  return (
    <Card title="닉네임 변경">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label="새 닉네임" hint="2~12자, 다른 사람과 겹치지 않아야 합니다." error={error}>
          {(id, describedBy) => (
            <input id={id} aria-describedby={describedBy} aria-invalid={Boolean(error)} className={inputClass} maxLength={12} value={nickname} onChange={(e) => setNickname(e.target.value)} />
          )}
        </Field>
        <Button type="submit" variant="primary" className="self-end" busy={busy} disabled={same || !nickname.trim()}>
          닉네임 바꾸기
        </Button>
      </form>
    </Card>
  );
}

function PasswordForm({ notify }: { notify: (m: string) => void }) {
  const empty = { currentPassword: '', newPassword: '', newPasswordConfirm: '' };
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<{ field?: string | undefined; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const errorFor = (field: string) => (error && (error.field === field || (!error.field && field === 'newPasswordConfirm')) ? error.message : null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.changePassword(form);
      setForm(empty);
      notify('비밀번호를 바꿨습니다. 다른 기기의 로그인은 모두 종료됐습니다.');
    } catch (err) {
      setError(err instanceof ApiError ? { field: err.field, message: err.message } : { message: '비밀번호를 바꾸지 못했습니다.' });
    }
    setBusy(false);
  };

  const input = (k: keyof typeof empty, label: string, autoComplete: string, hint?: string) => (
    <Field label={label} hint={hint} error={errorFor(k)}>
      {(id, describedBy) => (
        <input id={id} type="password" autoComplete={autoComplete} aria-describedby={describedBy} aria-invalid={Boolean(errorFor(k))} className={inputClass} value={form[k]} onChange={set(k)} />
      )}
    </Field>
  );

  return (
    <Card title="비밀번호 변경">
      <form onSubmit={submit} className="flex flex-col gap-3">
        {input('currentPassword', '현재 비밀번호', 'current-password')}
        {input('newPassword', '새 비밀번호', 'new-password', '8자 이상, 영문과 숫자를 함께 넣어 주세요.')}
        {input('newPasswordConfirm', '새 비밀번호 확인', 'new-password')}
        <Button type="submit" variant="primary" className="self-end" busy={busy} disabled={!form.currentPassword || !form.newPassword || !form.newPasswordConfirm}>
          비밀번호 바꾸기
        </Button>
      </form>
    </Card>
  );
}

function DeleteAccount({ onDeleted }: { onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.deleteAccount(password);
      onDeleted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '탈퇴하지 못했습니다.');
      setBusy(false);
    }
  };

  return (
    <Card title="회원 탈퇴">
      <p className="text-sm leading-relaxed text-muted">탈퇴하면 칩이 모두 사라지고 되돌릴 수 없습니다. 지난 판 기록에는 이름 대신 "탈퇴회원"으로 남습니다.</p>
      <Button variant="danger" className="self-start" onClick={() => setOpen(true)}>
        탈퇴하기
      </Button>
      <Dialog
        open={open}
        title="정말 탈퇴할까요?"
        onClose={() => {
          setOpen(false);
          setPassword('');
          setError(null);
        }}
      >
        <form onSubmit={submit} className="flex flex-col gap-3">
          <p className="text-[15px] leading-relaxed text-muted">칩과 계정이 삭제되고 같은 아이디로 다시 로그인할 수 없습니다. 확인을 위해 비밀번호를 입력해 주세요.</p>
          <Field label="비밀번호" error={error}>
            {(id, describedBy) => (
              <input id={id} type="password" autoComplete="current-password" aria-describedby={describedBy} aria-invalid={Boolean(error)} className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} />
            )}
          </Field>
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              그만두기
            </Button>
            <Button type="submit" variant="danger" busy={busy} disabled={!password}>
              탈퇴하기
            </Button>
          </div>
        </form>
      </Dialog>
    </Card>
  );
}
