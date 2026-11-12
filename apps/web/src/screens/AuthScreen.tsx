import { useState, type FormEvent } from 'react';
import { api, ApiError, type PublicUser } from '../lib/api.js';
import { Button, Field, inputClass } from '../components/ui.js';
import { PlayingCard } from '../components/PlayingCard.js';

type Tab = 'login' | 'signup';

type Check = { state: 'idle' | 'checking' | 'ok' | 'bad'; message?: string | undefined };

const USERNAME_RE = /^[a-z0-9]{4,20}$/;

export function AuthScreen({ onDone }: { onDone: (user: PublicUser) => void }) {
  const [tab, setTab] = useState<Tab>('login');
  return (
    <div className="flex min-h-full items-center justify-center px-4 py-8">
      <div className="flex w-full max-w-4xl flex-col items-center gap-8 md:flex-row md:items-center md:gap-14">
        <div className="flex flex-col items-center gap-4 md:flex-1 md:items-start">
          <div className="flex -space-x-5" aria-hidden>
            <PlayingCard card={{ rank: 14, suit: 'S' }} size="lg" className="-rotate-12" />
            <PlayingCard card={{ rank: 13, suit: 'H' }} size="lg" className="-rotate-3 translate-y-[-6px]" />
            <PlayingCard card={null} size="lg" className="rotate-6" />
          </div>
          <h1 className="font-serif text-[clamp(1.75rem,4vw,2.5rem)] leading-tight font-bold text-gold">함께 치는 카드 게임</h1>
          <p className="max-w-sm text-center text-[15px] leading-relaxed text-muted md:text-left">
            7포커, 텍사스 홀덤, 훌라를 지인들과 함께 또는 봇과 혼자 즐길 수 있습니다. 칩은 가상 칩이며 실제 돈과 바꿀 수 없습니다.
          </p>
        </div>

        <section className="pearl-ring w-full max-w-sm rounded-2xl bg-lacquer-2/95 p-5 shadow-[0_18px_40px_rgb(0_0_0/0.5)]">
          <div role="tablist" aria-label="로그인 또는 회원가입" className="mb-5 grid grid-cols-2 rounded-lg bg-lacquer p-1">
            {(['login', 'signup'] as const).map((t) => (
              <button
                key={t}
                role="tab"
                type="button"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`min-h-10 rounded-md text-[15px] font-bold transition-colors ${tab === t ? 'bg-rim text-gold' : 'text-muted hover:text-ivory'}`}
              >
                {t === 'login' ? '로그인' : '회원가입'}
              </button>
            ))}
          </div>
          {tab === 'login' ? <LoginForm onDone={onDone} /> : <SignupForm onDone={onDone} />}
        </section>
      </div>
    </div>
  );
}

function RememberBox({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[15px]">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="h-5 w-5" />
      로그인 상태 유지
      <span className="text-[13px] text-muted">(30일)</span>
    </label>
  );
}

function LoginForm({ onDone }: { onDone: (user: PublicUser) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username || !password) return setError('아이디와 비밀번호를 입력해 주세요.');
    setBusy(true);
    setError(null);
    try {
      const { user } = await api.login({ username: username.trim(), password, remember });
      onDone(user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '로그인하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field label="아이디">
        {(id) => <input id={id} className={inputClass} autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} />}
      </Field>
      <Field label="비밀번호">
        {(id) => <input id={id} type="password" className={inputClass} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
      </Field>
      <RememberBox value={remember} onChange={setRemember} />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" busy={busy} className="w-full text-base">
        로그인
      </Button>
    </form>
  );
}

function SignupForm({ onDone }: { onDone: (user: PublicUser) => void }) {
  const [username, setUsername] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [remember, setRemember] = useState(true);
  const [idCheck, setIdCheck] = useState<Check>({ state: 'idle' });
  const [nickCheck, setNickCheck] = useState<Check>({ state: 'idle' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const checkId = async () => {
    if (!username) return setIdCheck({ state: 'idle' });
    if (!USERNAME_RE.test(username)) return setIdCheck({ state: 'bad', message: '아이디는 영문 소문자와 숫자 4~20자로 입력해 주세요.' });
    setIdCheck({ state: 'checking' });
    try {
      const r = await api.checkUsername(username);
      setIdCheck({ state: r.available ? 'ok' : 'bad', message: r.message });
    } catch {
      setIdCheck({ state: 'idle' });
    }
  };
  const checkNick = async () => {
    const v = nickname.trim();
    if (!v) return setNickCheck({ state: 'idle' });
    setNickCheck({ state: 'checking' });
    try {
      const r = await api.checkNickname(v);
      setNickCheck({ state: r.available ? 'ok' : 'bad', message: r.message });
    } catch {
      setNickCheck({ state: 'idle' });
    }
  };

  const pwProblem =
    password && (password.length < 8 ? '비밀번호는 8자 이상이어야 합니다.' : !(/[A-Za-z]/.test(password) && /\d/.test(password)) ? '영문과 숫자를 모두 넣어 주세요.' : null);
  const confirmProblem = confirm && confirm !== password ? '비밀번호 확인이 일치하지 않습니다.' : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const { user } = await api.signup({ username, password, passwordConfirm: confirm, nickname: nickname.trim(), remember });
      onDone(user);
    } catch (err) {
      if (err instanceof ApiError) setErrors({ [err.field ?? 'form']: err.message });
      else setErrors({ form: '가입하지 못했습니다.' });
    } finally {
      setBusy(false);
    }
  };

  const msg = (c: Check) => (c.state === 'checking' ? '확인하는 중입니다…' : c.message);

  return (
    <form onSubmit={submit} className="flex flex-col gap-3.5" noValidate>
      <Field
        label="아이디"
        hint="영문 소문자와 숫자 4~20자"
        error={errors.username ?? (idCheck.state === 'bad' ? msg(idCheck) : null)}
        ok={idCheck.state === 'ok' || idCheck.state === 'checking' ? msg(idCheck) : null}
      >
        {(id, d) => (
          <input
            id={id}
            aria-describedby={d}
            aria-invalid={idCheck.state === 'bad' || Boolean(errors.username)}
            className={inputClass}
            autoComplete="username"
            autoCapitalize="none"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value.toLowerCase());
              setIdCheck({ state: 'idle' });
            }}
            onBlur={checkId}
          />
        )}
      </Field>
      <Field
        label="닉네임"
        hint="2~12자, 한글·영문·숫자·밑줄"
        error={errors.nickname ?? (nickCheck.state === 'bad' ? msg(nickCheck) : null)}
        ok={nickCheck.state === 'ok' || nickCheck.state === 'checking' ? msg(nickCheck) : null}
      >
        {(id, d) => (
          <input
            id={id}
            aria-describedby={d}
            aria-invalid={nickCheck.state === 'bad' || Boolean(errors.nickname)}
            className={inputClass}
            autoComplete="nickname"
            value={nickname}
            onChange={(e) => {
              setNickname(e.target.value);
              setNickCheck({ state: 'idle' });
            }}
            onBlur={checkNick}
          />
        )}
      </Field>
      <Field label="비밀번호" hint="8자 이상, 영문과 숫자 포함" error={errors.password ?? pwProblem}>
        {(id, d) => (
          <input id={id} aria-describedby={d} aria-invalid={Boolean(pwProblem)} type="password" className={inputClass} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        )}
      </Field>
      <Field label="비밀번호 확인" error={errors.passwordConfirm ?? confirmProblem}>
        {(id, d) => (
          <input id={id} aria-describedby={d} aria-invalid={Boolean(confirmProblem)} type="password" className={inputClass} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        )}
      </Field>
      <p className="rounded-lg border border-gold/25 bg-lacquer px-3 py-2.5 text-[13px] leading-relaxed text-muted">
        이메일을 받지 않으므로 <strong className="text-ivory">비밀번호를 잊으면 복구할 수 없습니다.</strong> 잊지 않도록 따로 적어 두세요.
      </p>
      <RememberBox value={remember} onChange={setRemember} />
      {errors.form && (
        <p role="alert" className="text-sm text-danger">
          {errors.form}
        </p>
      )}
      <Button type="submit" variant="primary" busy={busy} className="w-full text-base" disabled={Boolean(pwProblem || confirmProblem)}>
        가입하고 시작하기
      </Button>
    </form>
  );
}
