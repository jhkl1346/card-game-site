import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, waitForServer, type PublicUser } from './lib/api.js';
import { useGameSocket } from './lib/socket.js';
import type { InRoomSnapshot } from './lib/types.js';
import { AuthScreen } from './screens/AuthScreen.js';
import { LobbyScreen } from './screens/LobbyScreen.js';
import { TableScreen } from './screens/TableScreen.js';
import { ProfileScreen } from './screens/ProfileScreen.js';
import { RankingScreen } from './screens/RankingScreen.js';
import { Button, Toasts } from './components/ui.js';
import { PlayingCard } from './components/PlayingCard.js';

type Boot = 'checking' | 'waking' | 'ready';

export function App() {
  const [boot, setBoot] = useState<Boot>('checking');
  const [user, setUser] = useState<PublicUser | null | undefined>(undefined);
  /** 로비에서 연 화면 (방에 들어가 있으면 게임 화면이 우선) */
  const [view, setView] = useState<'lobby' | 'profile' | 'ranking'>('lobby');

  // 1) 서버가 깨어 있는지 확인 (무료 서버는 잠들어 있으면 첫 응답이 늦다)
  useEffect(() => {
    const ctrl = new AbortController();
    void waitForServer(() => setBoot((b) => (b === 'ready' ? b : 'waking')), ctrl.signal).then(() => {
      if (!ctrl.signal.aborted) setBoot('ready');
    });
    return () => ctrl.abort();
  }, []);

  // 2) 자동 로그인 (쿠키가 살아 있으면 내 정보를 받는다)
  useEffect(() => {
    if (boot !== 'ready') return;
    api
      .me()
      .then(({ user }) => setUser(user))
      .catch((err) => setUser(err instanceof ApiError && err.status === 401 ? null : null));
  }, [boot]);

  const socket = useGameSocket(Boolean(user));

  const logout = useCallback(async () => {
    await api.logout().catch(() => undefined);
    setUser(null);
    setView('lobby');
  }, []);

  // 내 정보 화면으로 갈 때 잔액을 최신으로
  const openView = useCallback((v: 'profile' | 'ranking') => {
    setView(v);
    void api
      .me()
      .then(({ user }) => setUser(user))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (socket.state === 'unauthorized') setUser(null);
  }, [socket.state]);

  if (boot !== 'ready' || user === undefined) return <WakeScreen waking={boot === 'waking'} />;
  if (!user) return <AuthScreen onDone={setUser} />;

  if (socket.state === 'replaced') {
    return (
      <CenterMessage title="다른 곳에서 로그인되었습니다">
        <p>같은 계정으로 다른 기기나 창에서 접속해 이 화면의 연결을 종료했습니다. 진행 중이던 판은 봇이 대신 이어서 칩니다.</p>
        <div className="mt-5 flex gap-2">
          <Button variant="primary" onClick={socket.reconnect}>
            이 화면에서 다시 접속
          </Button>
          <Button variant="ghost" onClick={logout}>
            로그아웃
          </Button>
        </div>
      </CenterMessage>
    );
  }

  const snap = socket.snapshot;
  const inRoom = snap?.room ? (snap as InRoomSnapshot) : null;

  return (
    <>
      {socket.state === 'reconnecting' && <ConnectionBanner state={socket.state} />}
      {inRoom ? (
        <TableScreen snap={inRoom} socket={socket} />
      ) : view === 'profile' ? (
        <ProfileScreen
          user={user}
          onBack={() => setView('lobby')}
          onUserChange={setUser}
          onDeleted={() => {
            setUser(null);
            setView('lobby');
          }}
          notify={socket.pushNotice}
        />
      ) : view === 'ranking' ? (
        <RankingScreen onBack={() => setView('lobby')} />
      ) : (
        <LobbyScreen user={user} socket={socket} onLogout={logout} onOpen={openView} />
      )}
      <Toasts notices={socket.notices} onDismiss={socket.dismissNotice} />
    </>
  );
}

function ConnectionBanner({ state }: { state: string }) {
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[70] bg-rim px-4 py-1.5 text-center text-sm font-bold text-gold">
      {state === 'connecting' ? '서버에 연결하는 중입니다…' : '연결이 끊겼습니다. 다시 연결하는 중입니다… (30초 안에 돌아오면 자리가 그대로 유지됩니다)'}
    </div>
  );
}

function WakeScreen({ waking }: { waking: boolean }) {
  return (
    <CenterMessage title={waking ? '서버를 깨우는 중입니다' : '불러오는 중입니다'}>
      {waking ? <p>무료 서버가 잠들어 있으면 첫 접속에 30초~1분 정도 걸릴 수 있습니다. 화면을 닫지 말고 잠시만 기다려 주세요.</p> : null}
      <div className="mt-6 flex justify-center gap-2" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className="animate-pulse" style={{ animationDelay: `${i * 0.25}s` }}>
            <PlayingCard card={null} size="sm" />
          </div>
        ))}
      </div>
    </CenterMessage>
  );
}

function CenterMessage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="pearl-ring max-w-md rounded-2xl bg-lacquer-2/95 p-6 text-[15px] leading-relaxed text-muted shadow-[0_18px_40px_rgb(0_0_0/0.5)]" role="status">
        <h1 className="mb-2 font-serif text-xl font-bold text-gold">{title}</h1>
        {children}
      </div>
    </div>
  );
}
