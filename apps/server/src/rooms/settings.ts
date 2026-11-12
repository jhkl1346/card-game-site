import { z } from 'zod';
import type { ServerLimits } from '../config/limits.js';
import { gameTypes, type GameType } from '../db/schema.js';
import { ADAPTERS } from './adapters.js';

/** 방 설정. 봇 난이도는 고정이라 설정 항목이 없다 */
export interface RoomSettings {
  gameType: GameType;
  /** 최대 인원 (봇 포함) */
  maxPlayers: number;
  /** 처음에 채울 봇 수 */
  botCount: number;
  /** 바이인(앉을 때 가져가는 칩). 잔액이 적으면 가진 만큼 앉는다 (최소 stake × MIN_BUYIN_MULTIPLIER) */
  buyIn: number;
  /** 판돈 단위: 7포커 앤티, 홀덤 빅블라인드(스몰은 절반), 훌라 점당 칩 */
  stake: number;
  /** 비공개 방은 목록에 나오지 않고 코드로만 입장한다 */
  isPrivate: boolean;
  /** 턴 제한 시간 (초) */
  turnSeconds: number;
}

/** 최소 바이인 = 판돈 × 이 값 */
export const MIN_BUYIN_MULTIPLIER = 20;

export const DEFAULT_ROOM_SETTINGS: Readonly<Record<GameType, Omit<RoomSettings, 'turnSeconds' | 'isPrivate'>>> = {
  stud7: { gameType: 'stud7', maxPlayers: 5, botCount: 3, buyIn: 5_000, stake: 50 },
  holdem: { gameType: 'holdem', maxPlayers: 6, botCount: 4, buyIn: 5_000, stake: 100 },
  hula: { gameType: 'hula', maxPlayers: 4, botCount: 2, buyIn: 5_000, stake: 10 },
};

export function defaultSettings(gameType: GameType, limits: ServerLimits): RoomSettings {
  return { ...DEFAULT_ROOM_SETTINGS[gameType], isPrivate: false, turnSeconds: limits.turnSeconds.default };
}

export function minBuyIn(settings: Pick<RoomSettings, 'stake'>): number {
  return settings.stake * MIN_BUYIN_MULTIPLIER;
}

/** 클라이언트가 보낸 방 설정을 검증하고 빠진 값은 게임별 기본값으로 채운다 */
export function parseRoomSettings(raw: unknown, limits: ServerLimits): RoomSettings {
  const base = z.object({ gameType: z.enum(gameTypes, { error: '게임 종류를 골라 주세요.' }) }).parse(raw);
  const adapter = ADAPTERS[base.gameType];
  const d = defaultSettings(base.gameType, limits);
  const schema = z
    .object({
      gameType: z.enum(gameTypes),
      maxPlayers: z
        .number()
        .int()
        .min(adapter.minPlayers, `${adapter.nameKo}는 ${adapter.minPlayers}~${adapter.maxPlayers}명입니다.`)
        .max(adapter.maxPlayers, `${adapter.nameKo}는 ${adapter.minPlayers}~${adapter.maxPlayers}명입니다.`)
        .default(d.maxPlayers),
      botCount: z.number().int().min(0).default(d.botCount),
      stake: z
        .number()
        .int()
        .min(10, '판돈은 10 이상이어야 합니다.')
        .max(10_000, '판돈은 10,000 이하여야 합니다.')
        .refine((v) => v % 10 === 0, '판돈은 10 단위로 정해 주세요.')
        .default(d.stake),
      buyIn: z.number().int().max(10_000_000).default(d.buyIn),
      isPrivate: z.boolean().default(false),
      turnSeconds: z
        .number()
        .int()
        .min(limits.turnSeconds.min, `턴 시간은 ${limits.turnSeconds.min}~${limits.turnSeconds.max}초입니다.`)
        .max(limits.turnSeconds.max, `턴 시간은 ${limits.turnSeconds.min}~${limits.turnSeconds.max}초입니다.`)
        .default(limits.turnSeconds.default),
    })
    .refine((s) => s.botCount <= s.maxPlayers - 1, { message: '봇 수는 최대 인원보다 적어야 합니다.', path: ['botCount'] })
    .refine((s) => s.buyIn >= s.stake * MIN_BUYIN_MULTIPLIER, {
      message: `바이인은 판돈의 ${MIN_BUYIN_MULTIPLIER}배 이상이어야 합니다.`,
      path: ['buyIn'],
    });
  return schema.parse(raw);
}
