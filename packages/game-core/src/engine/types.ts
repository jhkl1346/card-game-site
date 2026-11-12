/** 게임에 참가하는 자리 정보 (사람·봇 공통) */
export interface PlayerInit {
  id: string;
  name: string;
  /** 이번 판에 가지고 앉은 테이블 칩 */
  chips: number;
  isBot?: boolean;
}

/** 모든 게임 결과가 공통으로 가지는 칩 정산 정보 */
export interface GameResultBase {
  /** 판 시작 대비 칩 증감 (모두 더하면 0) */
  chipDeltas: Record<string, number>;
  /** 판이 끝난 뒤 테이블 칩 */
  finalChips: Record<string, number>;
}

/**
 * 모든 게임 엔진의 공통 인터페이스.
 * - 내부 상태는 불변 객체로 관리하며, 액션마다 새 상태로 교체한다.
 * - getState(playerId)는 그 사람이 봐도 되는 정보만 담는다. (상대 비공개 카드, 번 카드, 남은 덱 제외)
 * - 봇도 사람과 똑같이 getState / getLegalActions / applyAction만 쓴다.
 */
export interface GameEngine<Options, Action, View, Result extends GameResultBase, LegalAction = Action> {
  init(players: readonly PlayerInit[], options: Options): void;
  /** playerId가 null이거나 참가자가 아니면 관전자 시야 */
  getState(playerId: string | null): View;
  /** 검증에 실패하면 예외를 던지고 상태를 바꾸지 않는다 */
  applyAction(playerId: string, action: Action): void;
  getLegalActions(playerId: string): LegalAction[];
  isFinished(): boolean;
  getResult(): Result | null;
}

/** 규칙 위반 등으로 액션을 받아들일 수 없을 때 던지는 예외 (메시지는 사용자에게 보여 줄 한국어) */
export class GameRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GameRuleError';
  }
}
