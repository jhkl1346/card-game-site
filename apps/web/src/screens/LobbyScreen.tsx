import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, type PublicUser, type WalletInfo } from '../lib/api.js';
import type { GameSocket } from '../lib/socket.js';
import { GAME_INFO, won, type GameType, type RoomSettingsInput, type RoomSummary } from '../lib/types.js';
import { Button, inputClass } from '../components/ui.js';
import { ChipMark, Icon } from '../components/Icon.js';
import { PlayingCard } from '../components/PlayingCard.js';
import { RoomSettingsDialog } from '../components/RoomSettingsDialog.js';
import { RulesDialog } from '../components/RulesDialog.js';

const GAMES: GameType[] = ['stud7', 'holdem', 'hula'];

/** 게임마다 다른 카드 모양 (선택 버튼 그림) */
const FANS: Record<GameType, Parameters<typeof PlayingCard>[0]['card'][]> = {
  stud7: [null, null, { rank: 7, suit: 'S' }, { rank: 7, suit: 'D' }],
  holdem: [{ rank: 14, suit: 'H' }, { rank: 13, suit: 'H' }],
  hula: [{ rank: 5, suit: 'C' }, { rank: 6, suit: 'C' }, { rank: 7, suit: 'C' }],
};

export function LobbyScreen({
  user,
  socket,
  onLogout,
}: {
  user: PublicUser;
  socket: GameSocket;
  onLogout: () => void;
}) {
  const [game, setGame] = useState<GameType>('holdem');
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [dialog, setDialog] = useState<'create' | 'single' | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const { emit, pushNotice, lobbyRooms, state } = socket;
  const [rooms, setRooms] = useState<RoomSummary[]>([]);

  const refreshWallet = useCallback(async () => {
    try {
      setWallet(await api.wallet());
    } catch {
      /* 잔액은 다음에 다시 불러온다 */
    }
  }, []);

  useEffect(() => {
    void refreshWallet();
  }, [refreshWallet]);

  // 방 목록 구독 (로비에 있는 동안만)
  useEffect(() => {
    if (state !== 'online') return;
    void emit<{ rooms: RoomSummary[] }>('lobby:subscribe').then((r) => r.ok && setRooms(r.rooms));
    return () => void emit('lobby:unsubscribe');
  }, [emit, state]);
  useEffect(() => setRooms(lobbyRooms), [lobbyRooms]);

  const run = async (key: string, event: string, payload?: unknown) => {
    setBusy(key);
    const r = await emit(event, payload);
    setBusy(null);
    if (!r.ok) {
      pushNotice(r.error);
      return r.error;
    }
    return null;
  };

  const claimRelief = async () => {
    setBusy('relief');
    try {
      const r = await api.claimRelief();
      pushNotice(`구제 칩 ${won(r.amount)}개를 받았습니다.`);
    } catch (err) {
      pushNotice(err instanceof ApiError ? err.message : '구제 칩을 받지 못했습니다.');
    }
    setBusy(null);
    void refreshWallet();
  };

  const createRoom = (settings: RoomSettingsInput) =>
    dialog === 'single' ? run('single', 'room:single', { gameType: settings.gameType, settings }) : run('create', 'room:create', settings);

  const joinCode = (e: FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c) void run('code', 'room:join', { code: c });
  };

  const balance = wallet?.balance ?? user.balance;
  const visibleRooms = rooms.filter((r) => r.gameType === game);
  const otherRooms = rooms.length - visibleRooms.length;

  return (
    <div className="mx-auto flex min-h-full max-w-5xl flex-col px-4 pb-6">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
        <h1 className="font-serif text-lg font-bold text-gold">카드 게임</h1>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-sm text-muted sm:inline">
            <b className="text-ivory">{user.nickname}</b> 님
          </span>
          <span className="flex items-center gap-1.5 rounded-full bg-lacquer px-3 py-1.5 text-[15px] font-bold" aria-label={`보유 칩 ${won(balance)}개`}>
            <ChipMark />
            {won(balance)}
          </span>
          {wallet?.canClaimRelief && (
            <Button variant="primary" className="min-h-10 px-3 text-sm" busy={busy === 'relief'} onClick={claimRelief}>
              구제 칩 {won(wallet.reliefAmount)} 받기
            </Button>
          )}
          <Button variant="ghost" className="min-h-10 px-3 text-sm" onClick={() => setRulesOpen(true)}>
            <Icon name="book" className="h-4 w-4" />
            족보·규칙
          </Button>
          <Button variant="ghost" className="min-h-10 px-3 text-sm" onClick={onLogout}>
            로그아웃
          </Button>
        </div>
      </header>

      {wallet && wallet.balance === 0 && !wallet.canClaimRelief && wallet.tableChips > 0 && (
        <p className="mb-3 rounded-lg bg-lacquer px-3 py-2 text-sm text-muted">테이블에 칩 {won(wallet.tableChips)}개가 남아 있어 구제 칩은 받을 수 없습니다.</p>
      )}

      <div className="grid flex-1 gap-4 md:grid-cols-[1.05fr_1fr] landscape:max-md:grid-cols-[1.05fr_1fr]">
        {/* 게임 고르기 + 시작 */}
        <section aria-labelledby="pick" className="flex flex-col gap-3">
          <h2 id="pick" className="sr-only">
            게임 고르기
          </h2>
          <div role="radiogroup" aria-label="게임 종류" className="flex flex-col gap-2">
            {GAMES.map((g) => {
              const on = g === game;
              return (
                <button
                  key={g}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setGame(g)}
                  className={`group relative flex min-h-[64px] items-center gap-4 overflow-hidden rounded-xl px-4 text-left transition-colors [@media(max-height:460px)]:min-h-[52px] ${
                    on ? 'pearl-ring bg-lacquer-2' : 'bg-lacquer/70 hover:bg-lacquer'
                  }`}
                >
                  <span className="flex w-[74px] shrink-0 -space-x-6 [@media(max-height:460px)]:scale-90" aria-hidden>
                    {FANS[g].map((c, i) => (
                      <PlayingCard key={i} card={c} size="sm" className={on ? '' : 'opacity-70'} />
                    ))}
                  </span>
                  <span className="flex flex-col py-2">
                    <span className={`font-serif text-[17px] font-bold ${on ? 'text-gold' : 'text-ivory'}`}>{GAME_INFO[g].name}</span>
                    <span className="text-[13px] leading-snug text-muted [@media(max-height:460px)]:hidden">{GAME_INFO[g].blurb}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-3 gap-2 [&>button]:px-2 [&>button]:whitespace-nowrap">
            <Button variant="primary" onClick={() => setDialog('single')}>
              <Icon name="bot" className="h-4 w-4" />
              혼자 하기
            </Button>
            <Button onClick={() => setDialog('create')}>
              <Icon name="plus" className="h-4 w-4" />방 만들기
            </Button>
            <Button busy={busy === 'quick'} onClick={() => void run('quick', 'room:quickJoin', { gameType: game })}>
              <Icon name="bolt" className="h-4 w-4" />
              빠른 입장
            </Button>
          </div>
          <form onSubmit={joinCode} className="flex gap-2">
            <label htmlFor="code" className="sr-only">
              비공개 방 입장 코드
            </label>
            <input
              id="code"
              className={`${inputClass} uppercase`}
              placeholder="비공개 방 입장 코드"
              autoCapitalize="characters"
              maxLength={12}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <Button type="submit" variant="ghost" className="shrink-0 whitespace-nowrap" busy={busy === 'code'} disabled={!code.trim()}>
              <Icon name="lock" className="h-4 w-4" />
              입장
            </Button>
          </form>
        </section>

        {/* 방 목록 */}
        <section aria-labelledby="list" className="pearl-ring m-[7px] flex min-h-[220px] flex-col rounded-2xl bg-lacquer p-3 shadow-[0_0_0_5px_var(--color-rim),0_0_0_7px_var(--color-rim-deep),0_12px_20px_rgb(0_0_0/0.5)]">
          <div className="mb-2 flex items-baseline justify-between px-1">
            <h2 id="list" className="font-serif text-base font-bold text-gold">
              {GAME_INFO[game].name} 방 목록
            </h2>
            {otherRooms > 0 && <span className="text-[13px] text-muted">다른 게임 방 {otherRooms}개</span>}
          </div>
          {visibleRooms.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-1 px-4 text-center text-sm text-muted">
              <p>지금 열려 있는 공개 방이 없습니다.</p>
              <p>방을 만들어 지인에게 알려 주거나, 빠른 입장으로 봇과 함께 시작해 보세요.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-1.5 overflow-y-auto">
              {visibleRooms.map((r) => (
                <RoomRow key={r.id} room={r} busy={busy} onJoin={(spectate) => void run(`join:${r.id}`, 'room:join', { roomId: r.id, spectate })} />
              ))}
            </ul>
          )}
        </section>
      </div>

      <RoomSettingsDialog
        open={dialog !== null}
        gameType={game}
        single={dialog === 'single'}
        balance={balance}
        onClose={() => setDialog(null)}
        onSubmit={createRoom}
      />
      <RulesDialog open={rulesOpen} onClose={() => setRulesOpen(false)} initial={game} />
    </div>
  );
}

function RoomRow({ room, busy, onJoin }: { room: RoomSummary; busy: string | null; onJoin: (spectate: boolean) => void }) {
  const full = room.players >= room.maxPlayers;
  return (
    <li className="flex items-center gap-3 rounded-lg bg-lacquer-2 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold">{room.title}</p>
        <p className="text-[13px] text-muted">
          {room.players}/{room.maxPlayers}명 (사람 {room.humans}) · 판돈 {won(room.stake)} · 시작 칩 {won(room.buyIn)}
          {room.status === 'playing' ? ' · 진행 중' : ' · 대기 중'}
        </p>
      </div>
      {full ? (
        <Button variant="ghost" className="min-h-10 px-3 text-sm" busy={busy === `join:${room.id}`} onClick={() => onJoin(true)}>
          <Icon name="eye" className="h-4 w-4" />
          관전
        </Button>
      ) : (
        <Button className="min-h-10 px-3 text-sm" busy={busy === `join:${room.id}`} onClick={() => onJoin(false)}>
          입장
        </Button>
      )}
    </li>
  );
}
