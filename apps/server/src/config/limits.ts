/**
 * 무료 서버의 자원 한도를 고려한 제한 값. 배포 서비스가 정해지면(9단계) 여기 숫자만 조정한다.
 */
export interface ServerLimits {
  /** 동시에 열 수 있는 최대 방 수. 넘으면 새 방 만들기를 막고 안내한다 */
  maxRooms: number;
  /** 방당 최대 관전자 수 */
  maxSpectatorsPerRoom: number;
  /** 채팅 한 줄 최대 글자 수 */
  chatMaxLength: number;
  /** 같은 사람이 채팅을 보낼 수 있는 최소 간격 (밀리초) */
  chatMinIntervalMs: number;
  /** 소켓 하나가 1초에 보낼 수 있는 요청 수 (순간적으로는 2배까지 허용) */
  socketEventsPerSecond: number;
  /** 접속이 끊긴 뒤 자리를 지켜 주는 시간 (밀리초). 지나면 봇이 대신 플레이한다 */
  reconnectGraceMs: number;
  /** 접속이 끊긴 채 이 시간이 지나면 판이 끝날 때 자리에서 일으키고 칩을 지갑으로 돌려준다 (밀리초) */
  absentStandMs: number;
  /** 판이 끝나고 다음 판을 시작하기까지 기다리는 시간 (밀리초) */
  nextHandDelayMs: number;
  /** 턴 제한 시간 범위와 기본값 (초) */
  turnSeconds: { min: number; max: number; default: number };
}

export const DEFAULT_SERVER_LIMITS: Readonly<ServerLimits> = Object.freeze<ServerLimits>({
  maxRooms: 50,
  maxSpectatorsPerRoom: 10,
  chatMaxLength: 200,
  chatMinIntervalMs: 1_000,
  socketEventsPerSecond: 10,
  reconnectGraceMs: 30_000,
  absentStandMs: 180_000,
  nextHandDelayMs: 5_000,
  turnSeconds: { min: 10, max: 60, default: 20 },
});
