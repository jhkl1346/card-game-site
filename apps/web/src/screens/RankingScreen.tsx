import { useEffect, useState } from 'react';
import { api, ApiError, type RankingEntry } from '../lib/api.js';
import { won } from '../lib/types.js';
import { ChipMark, Icon } from '../components/Icon.js';
import { ScreenHeader } from './ProfileScreen.js';

export function RankingScreen({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<{ top: RankingEntry[]; me: RankingEntry | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .ranking()
      .then((r) => alive && setData(r))
      .catch((e) => alive && setError(e instanceof ApiError ? e.message : '랭킹을 불러오지 못했습니다.'));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col px-4 pb-6">
      <ScreenHeader title="칩 랭킹" onBack={onBack} />
      <p className="mb-3 text-sm text-muted">지갑과 테이블에 있는 칩을 합친 순위입니다. 칩이 같으면 같은 순위입니다.</p>
      {error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : !data ? (
        <p className="text-sm text-muted">랭킹을 불러오는 중입니다…</p>
      ) : data.top.length === 0 ? (
        <p className="text-sm text-muted">아직 순위에 오른 사람이 없습니다.</p>
      ) : (
        <ol className="flex flex-col gap-1.5" aria-label="칩 순위">
          {data.top.map((e, i) => (
            <Row key={i} entry={e} />
          ))}
          {data.me && (
            <>
              <li aria-hidden className="py-0.5 text-center text-muted">
                ⋮
              </li>
              <Row entry={data.me} />
            </>
          )}
        </ol>
      )}
    </div>
  );
}

function Row({ entry }: { entry: RankingEntry }) {
  const podium = entry.rank <= 3;
  return (
    <li
      aria-current={entry.isMe || undefined}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${entry.isMe ? 'pearl-ring bg-lacquer-2' : 'bg-lacquer/70'}`}
    >
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full font-serif text-[15px] font-bold tabular-nums ${podium ? 'pearl-fill text-ink' : 'bg-lacquer-3 text-muted'}`}>
        {entry.rank === 1 ? <Icon name="crown" className="h-4 w-4" /> : entry.rank}
      </span>
      <span className={`min-w-0 flex-1 truncate text-[15px] font-bold ${entry.isMe ? 'text-gold' : 'text-ivory'}`}>
        {entry.nickname}
        {entry.isMe && <span className="ml-1.5 text-[13px] font-normal text-muted">(나)</span>}
        {entry.rank === 1 && <span className="sr-only"> 1위</span>}
      </span>
      <span className="flex items-center gap-1.5 font-bold tabular-nums">
        <ChipMark />
        {won(entry.chips)}
      </span>
    </li>
  );
}
