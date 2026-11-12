/**
 * 봇 난이도 수치. 난이도는 "중상급" 하나로 고정하며, 사용자가 고르는 옵션은 두지 않는다.
 * 강도를 조정할 때는 이 값만 바꾼다. (9단계에서 실제 대전 결과를 보고 조정)
 */
export interface BotConfig {
  /** 최선이 아닌 차선의 선택을 하는 확률 (10~15%) */
  mistakeRate: number;
  /** 약한 패로 블러프 베팅하는 확률 (아무도 베팅하지 않았을 때) */
  bluffRate: number;
  /** 강한 패에서 레이즈를 고르는 성향 (0~1) */
  aggression: number;
  /** 콜하려면 패 강도가 팟 오즈보다 이만큼 높아야 함 */
  callMargin: number;
  /** 사람처럼 보이게 하는 생각 시간 (밀리초) */
  minDelayMs: number;
  maxDelayMs: number;
}

export const BOT_CONFIG: Readonly<BotConfig> = Object.freeze({
  mistakeRate: 0.12,
  bluffRate: 0.08,
  aggression: 0.6,
  callMargin: 0.05,
  minDelayMs: 800,
  maxDelayMs: 2500,
});

/** 0 이상 1 미만의 난수 (봇 판단용. 셔플과 달리 보안 난수일 필요는 없음) */
export type BotRandom = () => number;

export function botThinkDelayMs(random: BotRandom = Math.random, config: BotConfig = BOT_CONFIG): number {
  return Math.round(config.minDelayMs + random() * (config.maxDelayMs - config.minDelayMs));
}

const BOT_PROFILES: ReadonlyArray<{ name: string; avatar: string }> = [
  { name: '하늘봇', avatar: 'bot-sky' },
  { name: '바다봇', avatar: 'bot-sea' },
  { name: '들꽃봇', avatar: 'bot-flower' },
  { name: '별빛봇', avatar: 'bot-star' },
  { name: '솔잎봇', avatar: 'bot-pine' },
  { name: '노을봇', avatar: 'bot-sunset' },
  { name: '구름봇', avatar: 'bot-cloud' },
  { name: '단풍봇', avatar: 'bot-maple' },
];

/** 봇 이름과 아바타. 한 방에서 겹치지 않도록 index로 고른다. */
export function botProfile(index: number): { name: string; avatar: string } {
  const profile = BOT_PROFILES[index % BOT_PROFILES.length]!;
  const round = Math.floor(index / BOT_PROFILES.length);
  return round === 0 ? profile : { ...profile, name: `${profile.name}${round + 1}` };
}
