import type { HoldemView, HulaView, Stud7View } from '@card-game/game-core';

/** 서버(apps/server/src/rooms/room.ts)의 RoomSummary와 같은 모양 */
export type GameType = 'stud7' | 'holdem' | 'hula';

export interface RoomSummary {
  id: string;
  gameType: GameType;
  gameName: string;
  title: string;
  isPrivate: boolean;
  status: 'waiting' | 'playing';
  players: number;
  humans: number;
  maxPlayers: number;
  spectators: number;
  stake: number;
  buyIn: number;
  turnSeconds: number;
}

export interface SeatInfo {
  index: number;
  id: string;
  name: string;
  isBot: boolean;
  stack: number;
  connected: boolean;
  botControlled: boolean;
  leaving: boolean;
  inHand: boolean;
}

export type GameView = Stud7View | HoldemView | HulaView;

export interface RoomSnapshot {
  seq: number;
  room:
    | (RoomSummary & {
        hostId: string;
        code: string | null;
        stakeLabel: string;
        minBuyIn: number;
        handNo: number;
        seats: Array<SeatInfo | null>;
        spectatorNames: string[];
      })
    | null;
  me: { userId: string | null; seatIndex: number | null; isHost: boolean; isSpectator: boolean };
  game: GameView | null;
  turn: { actorId: string; deadline: number | null } | null;
  nextHandAt: number | null;
  serverNow: number;
}

export type InRoomSnapshot = RoomSnapshot & { room: NonNullable<RoomSnapshot['room']> };

export interface RoomSettingsInput {
  gameType: GameType;
  maxPlayers: number;
  botCount: number;
  buyIn: number;
  stake: number;
  isPrivate: boolean;
  turnSeconds: number;
}

/** 서버 기본값과 같은 값 (apps/server/src/rooms/settings.ts) */
export const GAME_INFO: Record<
  GameType,
  { name: string; min: number; max: number; stakeLabel: string; defaults: Omit<RoomSettingsInput, 'isPrivate' | 'turnSeconds'>; blurb: string }
> = {
  stud7: {
    name: '7포커',
    min: 2,
    max: 5,
    stakeLabel: '앤티',
    defaults: { gameType: 'stud7', maxPlayers: 5, botCount: 3, buyIn: 5_000, stake: 50 },
    blurb: '7장 중 4장을 펼쳐 놓고 삥·따당·하프로 겨룹니다.',
  },
  holdem: {
    name: '텍사스 홀덤',
    min: 2,
    max: 9,
    stakeLabel: '빅블라인드',
    defaults: { gameType: 'holdem', maxPlayers: 6, botCount: 4, buyIn: 5_000, stake: 100 },
    blurb: '내 카드 2장과 가운데 5장으로 가장 높은 족보를 만듭니다.',
  },
  hula: {
    name: '훌라',
    min: 2,
    max: 4,
    stakeLabel: '점당 칩',
    defaults: { gameType: 'hula', maxPlayers: 4, botCount: 2, buyIn: 5_000, stake: 10 },
    blurb: '같은 숫자나 이어지는 무늬를 등록하고 손패를 먼저 비웁니다.',
  },
};

export const MIN_BUYIN_MULTIPLIER = 20;
export const TURN_SECONDS = { min: 10, max: 60, default: 20 };

export const won = (n: number) => n.toLocaleString('ko-KR');
