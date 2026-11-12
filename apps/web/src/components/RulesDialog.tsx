import {
  DEFAULT_HOLDEM_RULES,
  DEFAULT_HULA_RULES,
  DEFAULT_STUD7_RULES,
  STUD7_ACTION_LABELS,
  SUIT_NAMES_KO,
  parseCards,
  type HulaRules,
  type Stud7Rules,
} from '@card-game/game-core';
import { useEffect, useState } from 'react';
import { GAME_INFO, type GameType } from '../lib/types.js';
import { PlayingCard } from './PlayingCard.js';
import { Dialog } from './ui.js';

const RANKINGS: Array<{ name: string; cards: string; note: string }> = [
  { name: '로열 스트레이트 플러시', cards: 'As Ks Qs Js Ts', note: '같은 무늬 A-K-Q-J-10' },
  { name: '스트레이트 플러시', cards: '9h 8h 7h 6h 5h', note: '같은 무늬로 이어진 5장' },
  { name: '포카드', cards: '8c 8d 8h 8s Kd', note: '같은 숫자 4장' },
  { name: '풀하우스', cards: 'Qd Qs Qc 4h 4s', note: '트리플 + 원페어' },
  { name: '플러시', cards: 'Kd 10d 7d 4d 2d', note: '같은 무늬 5장' },
  { name: '스트레이트', cards: '6c 5d 4s 3h 2c', note: '이어진 숫자 5장 (A-2-3-4-5도 인정)' },
  { name: '트리플', cards: '9s 9d 9c Kh 3d', note: '같은 숫자 3장' },
  { name: '투페어', cards: 'Jh Jc 5d 5s Ac', note: '원페어 2개' },
  { name: '원페어', cards: '10s 10h Ad 8c 4h', note: '같은 숫자 2장' },
  { name: '하이카드', cards: 'Ah Jd 8s 6c 3d', note: '가장 높은 카드로 비교' },
];

/** 족보표와 게임별 규칙. stud7Rules/hulaRules를 넘기면 지금 방에 적용된 값을 보여 준다 */
export function RulesDialog({
  open,
  onClose,
  initial,
  stud7Rules = DEFAULT_STUD7_RULES,
  hulaRules = DEFAULT_HULA_RULES,
}: {
  open: boolean;
  onClose: () => void;
  initial: GameType;
  stud7Rules?: Stud7Rules;
  hulaRules?: HulaRules;
}) {
  const [tab, setTab] = useState<GameType | 'ranks'>(initial === 'hula' ? 'hula' : 'ranks');
  useEffect(() => {
    if (open) setTab(initial === 'hula' ? 'hula' : 'ranks');
  }, [open, initial]);

  const tabs: Array<[GameType | 'ranks', string]> = [
    ['ranks', '족보표'],
    ['stud7', '7포커'],
    ['holdem', '홀덤'],
    ['hula', '훌라'],
  ];

  return (
    <Dialog open={open} title="족보와 규칙" onClose={onClose} wide>
      <div role="tablist" aria-label="규칙 종류" className="sticky top-0 z-10 -mx-1 mb-4 flex gap-1 overflow-x-auto bg-lacquer-2 pb-2">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`min-h-10 shrink-0 rounded-lg px-4 font-bold ${tab === key ? 'bg-rim text-gold' : 'text-muted hover:text-ivory'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="text-[15px] leading-relaxed text-ivory-dim">
        {tab === 'ranks' && <Rankings />}
        {tab === 'stud7' && <Stud7Rules rules={stud7Rules} />}
        {tab === 'holdem' && <HoldemRulesText />}
        {tab === 'hula' && <HulaRulesText rules={hulaRules} />}
      </div>
    </Dialog>
  );
}

function Rankings() {
  return (
    <>
      <p className="mb-3 text-sm text-muted">7포커와 텍사스 홀덤에서 함께 씁니다. 7장 중 가장 좋은 5장을 자동으로 골라 비교합니다. 위쪽이 더 높습니다.</p>
      <ol className="flex flex-col gap-1.5">
        {RANKINGS.map((r, i) => (
          <li key={r.name} className="flex items-center gap-3 rounded-lg bg-lacquer px-3 py-2">
            <span className="w-5 shrink-0 text-right text-sm font-bold text-gold">{i + 1}</span>
            <span className="w-32 shrink-0 sm:w-44">
              <b className="block text-ivory">{r.name}</b>
              <span className="text-[13px] text-muted">{r.note}</span>
            </span>
            <span className="ml-auto flex gap-1" aria-hidden>
              {parseCards(r.cards).map((c, j) => (
                <PlayingCard key={j} card={c} size="xs" />
              ))}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-sm text-muted">A는 가장 높은 카드이며 A-2-3-4-5 스트레이트에서만 낮은 카드로 씁니다. K-A-2처럼 넘어가는 스트레이트는 인정하지 않습니다.</p>
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-3 border-b border-gold/10 py-2 last:border-0">
      <dt className="w-40 shrink-0 text-muted">{k}</dt>
      <dd className="text-ivory">{v}</dd>
    </div>
  );
}

function Stud7Rules({ rules }: { rules: Stud7Rules }) {
  const suits = rules.suitRank.map((s) => SUIT_NAMES_KO[s]).join(' > ');
  return (
    <>
      <p className="mb-3">
        {rules.chooseOpenCard
          ? '모두 앤티를 낸 뒤 카드 3장을 뒷면으로 받고, 그중 1장을 골라 펼칩니다(모두 고르면 한꺼번에 펼쳐짐). '
          : '모두 앤티를 낸 뒤 숨긴 카드 2장과 펼친 카드 1장을 받습니다. '}
        이후 4·5·6번째 카드는 펼쳐서, 마지막 7번째 히든 카드는 숨겨서 받으며(눌러서 확인) 카드를 받을 때마다 베팅합니다. 끝까지 남은 사람 중 족보가 가장 높은 사람이 판돈을 가져갑니다.
      </p>
      <p className="mb-3 text-sm text-muted">
        베팅: 삥(첫 베팅, 앤티만큼), 따당(콜하고 직전 베팅 증가분만큼 더), 쿼터·하프·풀(콜하고 판돈의 1/4·1/2·전부만큼 더), 콜, 체크, 다이.
      </p>
      <h3 className="mb-1 font-serif font-bold text-gold">이 방에 적용된 규칙 (Stud7Rules)</h3>
      <dl className="rounded-lg bg-lacquer px-3">
        <Row k="펼칠 카드" v={rules.chooseOpenCard ? '처음 3장 중 직접 고름' : '3번째 카드가 자동으로 펼쳐짐'} />
        <Row k="첫 라운드 시작" v={rules.firstRoundStarter === 'lowestOpenCard' ? '펼친 카드가 가장 낮은 사람' : '펼친 카드가 가장 높은 사람'} />
        <Row k="이후 라운드 시작" v="펼친 카드의 족보가 가장 높은 사람" />
        <Row k="무늬 순서" v={`${suits} (펼친 카드 비교 때만)`} />
        <Row k="족보가 완전히 같을 때" v={rules.tieBreakBySuit ? '무늬로 승자를 정함' : '판돈을 나눔'} />
        <Row k="라운드당 레이즈" v={rules.maxRaisesPerRound === null ? '제한 없음' : `한 사람당 ${rules.maxRaisesPerRound}번`} />
        <Row k="최대 베팅" v={rules.maxBetAction === 'full' ? '풀' : '하프'} />
        <Row k="첫 라운드 가능 액션" v={rules.firstRoundActions.map((a) => STUD7_ACTION_LABELS[a]).join(', ')} />
        <Row k="쿼터·하프·풀 기준" v={rules.potBetBase === 'afterCall' ? '콜한 뒤의 판돈' : '콜하기 전의 판돈'} />
      </dl>
    </>
  );
}

function HoldemRulesText() {
  const r = DEFAULT_HOLDEM_RULES;
  return (
    <>
      <p className="mb-3">
        딜러 버튼 왼쪽 두 사람이 스몰·빅블라인드를 내고, 모두 카드 2장을 받습니다. 프리플랍 → 플랍(3장) → 턴(1장) → 리버(1장) 순서로 가운데 카드를 펼치며 베팅합니다. 내 카드 2장과 가운데 5장 중 가장 좋은 5장으로 겨룹니다.
      </p>
      <dl className="rounded-lg bg-lacquer px-3">
        <Row k="번 카드" v={r.burnBeforeFlop && r.burnBeforeTurn && r.burnBeforeRiver ? '플랍·턴·리버 앞에 1장씩 버림 (아무도 볼 수 없음)' : '일부 생략'} />
        <Row k="올인" v="가진 칩을 모두 걸면 사이드 팟이 따로 계산됩니다" />
        <Row k="나누고 남는 칩" v="버튼 왼쪽부터 한 개씩" />
      </dl>
    </>
  );
}

function HulaRulesText({ rules }: { rules: HulaRules }) {
  return (
    <>
      <p className="mb-3">
        7장씩 받고, 차례마다 덱이나 버린 더미에서 1장을 가져온 뒤 등록·붙이기를 하고 1장을 버립니다. 같은 숫자 3~4장(세트)이나 같은 무늬로 이어진 3장 이상(런)을 등록할 수 있습니다. 손패를 먼저 모두 털면 이기고, 나머지 사람은 손에 남은 점수만큼 칩을 냅니다.
      </p>
      <h3 className="mb-1 font-serif font-bold text-gold">이 방에 적용된 규칙 (HulaRules)</h3>
      <dl className="rounded-lg bg-lacquer px-3">
        <Row k="7 한 장 등록" v={rules.sevenAlone ? '가능' : '불가'} />
        <Row k="조커" v={rules.jokers === 0 ? '사용 안 함' : `${rules.jokers}장 (손에 남으면 ${rules.jokerPoints}점)`} />
        <Row k="J·Q·K 점수" v={rules.faceCardPoints === 'ten' ? '각 10점' : '11·12·13점'} />
        <Row k="런에서 A" v={rules.aceHighInRun ? 'A-2-3, Q-K-A 모두 가능' : 'A-2-3만 가능'} />
        <Row k="남의 등록에 붙이기" v={rules.layOffToOthers ? '가능' : '불가'} />
        <Row k="버린 카드 가져오기" v={rules.discardPickup === 'mustUse' ? '그 차례에 바로 등록·붙이기에 쓸 때만' : '자유'} />
        <Row k="스톱" v={rules.stopEnabled ? `손패 ${rules.stopMaxPoints}점 이하일 때 선언 (실패하면 ${rules.stopFailMultiplier}배)` : '사용 안 함'} />
        <Row k="훌라 (한 번에 모두 털기)" v={`정산 ${rules.hulaMultiplier}배`} />
        <Row k="정산" v={rules.settlement === 'points' ? '남은 점수 × 점당 칩' : '고정 판돈 × 배수'} />
      </dl>
    </>
  );
}

export const GAME_NAMES = Object.fromEntries(Object.entries(GAME_INFO).map(([k, v]) => [k, v.name])) as Record<GameType, string>;
