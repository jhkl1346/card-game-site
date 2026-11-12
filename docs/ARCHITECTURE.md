# 전체 설계 (Architecture)

> 요구사항 원문은 [`PROMPT.md`](../PROMPT.md)입니다. 이 문서는 그 요구사항을 구현하기 위한 설계이며, 단계가 진행되면서 확정된 내용으로 갱신합니다.
> "결정 보류" 표시가 있는 항목은 해당 단계에서 근거와 함께 다시 확인합니다.

## 1. 폴더 구조 (monorepo, pnpm workspace)

```
card-game-site/
├─ apps/
│  ├─ web/                    # 프론트엔드 (React + TS + Vite, Tailwind, Framer Motion)
│  │  └─ src/
│  │     ├─ pages/            # 로그인, 로비, 방 설정, 테이블, 내 정보, 랭킹
│  │     ├─ components/       # 카드(SVG), 칩, 좌석, 액션 버튼, 모달
│  │     ├─ games/            # stud7 / holdem / hula 테이블 화면
│  │     ├─ net/              # Socket.IO 클라이언트, REST 호출
│  │     └─ store/            # 클라이언트 상태 (서버 스냅샷 반영)
│  └─ server/                 # 백엔드 (Node.js + TS, Socket.IO)
│     └─ src/
│        ├─ auth/             # 가입, 로그인, 세션 쿠키, 로그인 실패 제한
│        ├─ db/               # 스키마, 마이그레이션, 리포지토리
│        ├─ rooms/            # GameRoom, 방 관리, 타이머, 재접속
│        ├─ bots/             # 봇 실행기 (딜레이, 자리 대행)
│        ├─ wallet/           # 칩 정산 트랜잭션, 구제 칩
│        ├─ config/           # ServerLimits, ReliefChipConfig, 환경변수
│        └─ socket/           # 이벤트 핸들러, 인증 미들웨어, rate limit
├─ packages/
│  └─ game-core/              # 서버·클라이언트 공유 순수 TS (Node/브라우저 API 의존 없음)
│     └─ src/
│        ├─ cards/            # Card, 덱 생성, 셔플(난수 함수 주입)
│        ├─ hand/             # 족보 판정기 evaluateHand
│        ├─ engine/           # GameEngine 공통 인터페이스
│        ├─ stud7/            # 7포커 엔진 + Stud7Rules
│        ├─ holdem/           # 홀덤 엔진 + HoldemRules + 사이드팟
│        ├─ hula/             # 훌라 엔진 + HulaRules
│        └─ bots/             # 봇 의사결정 + BotConfig
├─ docs/                      # 설계, 규칙 가정, 배포 보고서
└─ .github/                   # CI 워크플로, PR/이슈 템플릿
```

`game-core`에는 `node:crypto` 같은 런타임 의존을 두지 않습니다. 셔플은 `randomInt(maxExclusive)` 함수를 인자로 받고, 서버가 `crypto.randomInt`를 넣어 호출합니다. 클라이언트도 같은 패키지를 쓰지만 셔플·분배는 하지 않고 족보 표시 같은 화면용 계산만 합니다.

## 2. 데이터 모델

### 2.1 공통 타입 (game-core)

```ts
type Suit = 'S' | 'H' | 'D' | 'C';            // 스페이드, 하트, 다이아, 클로버
type Rank = 2 | 3 | ... | 13 | 14;            // 11=J, 12=Q, 13=K, 14=A
interface Card { rank: Rank; suit: Suit }      // 문자열 표기: "As", "Td", "2c"

enum HandCategory { HighCard, OnePair, TwoPair, Trips, Straight,
                    Flush, FullHouse, Quads, StraightFlush, RoyalFlush }
interface HandRank {
  category: HandCategory;
  name: string;          // 한국어 족보 이름
  values: number[];      // 비교용 숫자 (족보 숫자 → 키커 순)
  score: number;         // 한 번의 숫자 비교로 우열을 가리는 값
  cards: Card[];         // 선택된 최고 5장
}

interface GameEngine<State, Action, View, Options, Result> {
  init(players: PlayerSeat[], options: Options): State;
  getState(state: State, playerId: string): View;          // 비공개 정보 제거된 시야
  applyAction(state: State, playerId: string, action: Action): State; // 검증 후 새 상태(불변)
  getLegalActions(state: State, playerId: string): Action[];
  isFinished(state: State): boolean;
  getResult(state: State): Result;                          // 칩 증감, 승자, 족보
}
```

상태는 불변 객체이고, `applyAction`은 검증에 실패하면 예외를 던지고 기존 상태를 바꾸지 않습니다. `getState(playerId)`는 상대 비공개 카드, 번 카드 내용, 남은 덱을 포함하지 않습니다(번 카드는 개수만, 남은 덱은 장수만).

### 2.2 DB 스키마 (영구 데이터만)

| 테이블 | 컬럼 | 비고 |
|---|---|---|
| `users` | id(PK), username(UNIQUE), password_hash, nickname(UNIQUE), email(NULL 허용), created_at, last_login_at, deleted_at(NULL 허용) | 탈퇴 시 username·nickname 익명화 |
| `sessions` | id(PK), user_id(FK), token_hash(UNIQUE), expires_at, persistent(bool), user_agent, created_at | 토큰은 SHA-256 해시만 저장 |
| `wallets` | user_id(PK, FK), balance(정수, ≥0), updated_at | |
| `game_results` | game_id(UNIQUE), game_type, participants(JSON), chip_deltas(JSON), ended_at | 중복 정산 방지 키 |
| `game_result_players` | game_id, user_id, chip_delta, rank | 전적·랭킹 조회용 |
| `chip_logs` | id, user_id, delta, reason(`signup`/`game`/`relief`/`buyin`/`refund`), game_id(NULL 허용), created_at | |
| `login_attempts` | key(아이디 또는 IP), fail_count, locked_until | 5회 실패 시 15분 잠금 |

- `chat_logs`는 무료 DB 용량을 아끼기 위해 기본으로 만들지 않습니다.
- 만료된 `sessions`, 보관 기간이 지난 `game_results`는 서버가 주기적으로 정리합니다.
- 번 카드, 남은 덱, 셔플 시드는 DB에 저장하지 않습니다.
- ORM은 **Drizzle**(Apache-2.0)을 기본안으로 합니다. 별도 엔진 바이너리 없이 가볍고, SQLite와 PostgreSQL을 모두 지원합니다. 두 DB의 스키마 문법이 달라서 로컬(SQLite)과 배포(PostgreSQL)용 스키마를 함께 관리하는 방법은 5단계에서 확정합니다(결정 보류).

### 2.3 칩 흐름

1. 방 입장 시 바이인만큼 `wallets.balance`에서 차감합니다(트랜잭션 1회, `chip_logs.reason = buyin`).
2. 판 중에는 테이블 칩을 메모리에서만 증감합니다.
3. 퇴장·접속 끊김·정상 종료는 모두 같은 정산 함수를 탑니다. `game_results`에 `game_id`를 넣으면서 남은 테이블 칩을 지갑에 되돌리는 작업을 **한 트랜잭션**으로 처리하고, `game_id` 유니크 제약으로 중복 정산을 막습니다.
4. 서버가 재시작되면 메모리의 판은 사라집니다. 그래서 바이인 시점의 기록으로 "판 시작 전 잔액"을 복구(환불)합니다. 시작할 때 아직 정산되지 않은 바이인을 찾아 `refund`로 돌려줍니다.
5. 구제 칩: 트랜잭션 안에서 `balance = 0`이고 앉아 있는 테이블의 칩이 0인지 확인한 뒤 `ReliefChipConfig.amount`를 지급합니다. 조건부 UPDATE(`WHERE balance = 0`)로 동시 요청 중 하나만 성공하게 합니다.

## 3. 인증 흐름

```
[가입] POST /api/auth/signup {username, password, passwordConfirm, nickname}
   → 서버 검증 (아이디 형식·중복, 비밀번호 규칙, 닉네임 길이·중복·금칙어)
   → argon2id 해시 → users + wallets(10,000) + chip_logs(signup) 한 트랜잭션
[중복 확인] GET /api/auth/check-username?u=...  (가입 화면 실시간 확인)
[로그인] POST /api/auth/login {username, password, remember}
   → login_attempts 확인 (아이디·IP 각각 5회 실패 시 15분 잠금)
   → 실패 메시지는 항상 "아이디 또는 비밀번호가 올바르지 않습니다"
   → 성공: 무작위 토큰(32바이트) 발급, DB에는 SHA-256 해시만 저장
   → Set-Cookie: sid=토큰; HttpOnly; Secure; SameSite=(아래 참고); Path=/
        remember=true → Max-Age 30일, 요청마다 만료 연장
        remember=false → 세션 쿠키(브라우저 종료 시 만료)
[자동 로그인] GET /api/auth/me → 쿠키 확인 후 사용자 정보 반환
[로그아웃] POST /api/auth/logout → DB 세션 삭제 + 쿠키 삭제
[소켓 인증] Socket.IO 연결 핸드셰이크에서 같은 쿠키를 검증
   → 같은 계정의 기존 소켓이 있으면 "다른 곳에서 로그인되어 접속을 종료합니다" 알림 후 끊고,
     진행 중인 자리는 봇이 대행 → 새 소켓이 방으로 자동 복귀
```

- 비밀번호 해시: `@node-rs/argon2`(MIT, 미리 빌드된 바이너리라 별도 컴파일 불필요)를 기본안으로 합니다.
- **도메인 분리 시 쿠키 정책**: 프론트와 백엔드가 서로 다른 무료 도메인이면 쿠키가 제3자(cross-site) 쿠키가 되어 `SameSite=None; Secure`가 필요하고, Safari 등 일부 브라우저에서는 막힐 수 있습니다. 그래서 **백엔드가 빌드된 프론트 정적 파일도 함께 제공하는 단일 도메인 구성**을 1순위로 검토합니다. 이 경우 `SameSite=Lax`를 쓸 수 있고 CORS도 필요 없습니다. 분리 배포가 불가피하면 `SameSite=None` + CORS 허용 출처 고정(`credentials: true`)으로 갑니다. 최종 결정은 9단계 배포 조사에서 합니다(결정 보류).
- 입력 검증은 서버에서 스키마 검증(zod, MIT)으로 하고, SQL은 ORM의 파라미터 바인딩만 씁니다. React의 기본 이스케이프를 그대로 쓰고 `dangerouslySetInnerHTML`은 쓰지 않습니다.

## 4. 소켓 이벤트 명세 (Socket.IO)

모든 이벤트는 인증된 소켓에서만 받습니다. 클라이언트 → 서버 이벤트는 ack 콜백으로 `{ ok: true, ... } | { ok: false, error: '한국어 메시지' }`를 돌려받습니다.

| 방향 | 이벤트 | 내용 |
|---|---|---|
| C→S | `lobby:subscribe` / `lobby:unsubscribe` | 방 목록 구독 |
| S→C | `lobby:rooms` | 공개 방 목록 스냅샷 |
| C→S | `room:create` | `{ gameType, maxPlayers, botCount, buyIn, blinds/ante, isPrivate, turnSeconds }` |
| C→S | `room:join` | `{ roomId }` 또는 `{ code }` (비공개 방) |
| C→S | `room:quickJoin` | `{ gameType }` 빈자리가 있는 방에 자동 입장 |
| C→S | `room:spectate` / `room:leave` | 관전 / 퇴장 (퇴장 시 정산) |
| C→S | `room:kick` / `room:transferHost` | 방장 전용 |
| C→S | `room:start` | 방장이 게임 시작 (싱글은 방 생성 직후 자동) |
| S→C | `room:snapshot` | 방 전체 스냅샷 + 내 시야의 게임 상태 (재접속·지연 복구용) |
| S→C | `game:event` | 증분 이벤트 (분배, 오픈, 베팅, 번 카드 **개수**, 쇼다운, 결과) + `seq` 번호 |
| C→S | `game:action` | `{ seq, action }` 차례·합법 액션 검증, 틀리면 무시하고 거절 |
| S→C | `game:turn` | 현재 차례, 남은 시간(서버 기준 마감 시각), 내 합법 액션 |
| C→S | `chat:send` | 길이·빈도 제한(`ServerLimits`) |
| S→C | `chat:message` | 방 채팅 (DB 저장 안 함) |
| S→C | `session:replaced` | 다른 곳에서 로그인되어 접속 종료 안내 |
| S→C | `server:notice` | 방 생성 한도 도달, 서버 재시작 환불 안내 등 |

- 클라이언트가 `seq`가 비는 것을 감지하면 `room:resync`를 보내 `room:snapshot`을 다시 받습니다.
- 소켓 단위 요청 빈도 제한을 두고, 차례가 아닌 사람의 액션은 무시합니다.

## 5. 설정 객체

| 이름 | 위치 | 주요 값 |
|---|---|---|
| `Stud7Rules` | game-core | firstRoundStarter, laterRoundStarter, suitRank, tieBreakBySuit |
| `HoldemRules` | game-core | burnBeforeFlop/Turn/River (기본 모두 true), 홀수 칩 처리 |
| `HulaRules` | game-core | 조커, 카드 점수, 스톱, 정산 (4단계 전에 가정 문서로 확인) |
| `BotConfig` | game-core | 실수 확률(10~15%), 블러프 빈도, 공격성, 딜레이 0.8~2.5초 |
| `ServerLimits` | server | 최대 동시 방 수, 방당 관전자 수, 채팅 길이·빈도 |
| `ReliefChipConfig` | server | amount 5,000, requiredBalance 0 |

## 6. 브랜치 / CI 구성

- 브랜치: `main`(항상 실행 가능) ← `feature/NN-기능명` PR, squash merge 후 브랜치 삭제.
- 커밋: Conventional Commits, 한국어 메시지.
- CI(`.github/workflows/ci.yml`): PR과 `main` 푸시 때 실행. pnpm 캐시 → 설치(`--frozen-lockfile`) → 린트 → 타입 검사 → 테스트 → 빌드. 같은 브랜치의 이전 실행은 자동 취소해 무료 실행 시간을 아낍니다.
- 족보 전수 테스트(2,598,960가지)는 객체를 미리 만들어 두고 반복문으로 돌려 몇 초 안에 끝나게 합니다.
- 배포 워크플로는 9단계에서 수동 실행(`workflow_dispatch`)으로만 만듭니다.

## 7. 도구·서비스 무료 여부

| 구분 | 이름 | 라이선스/요금 |
|---|---|---|
| 언어/런타임 | TypeScript, Node.js | Apache-2.0 / MIT 계열 |
| 패키지 매니저 | pnpm | MIT |
| 프론트 | React, Vite, Tailwind CSS, Framer Motion | 모두 MIT |
| 서버 | Socket.IO | MIT |
| ORM | Drizzle ORM | Apache-2.0 |
| 해시 | @node-rs/argon2 | MIT |
| 검증 | zod | MIT |
| 테스트 | Vitest | MIT |
| 린트 | ESLint, typescript-eslint | MIT / MIT(BSD-2 일부) |
| 로컬 DB | SQLite (better-sqlite3) | Public Domain / MIT |
| 형상 관리·CI | GitHub, GitHub Actions | 비공개 저장소 무료 실행 시간 한도 내 |
| 배포 | 미정 | 9단계에서 공식 문서로 현재 무료 조건 확인 후 보고 |
| 에셋 | 카드·아이콘 직접 SVG 제작 | `ASSETS.md`에 기록 |

## 8. 규칙 관련 가정과 확인 예정 항목

- 7포커: PROMPT.md의 기본값을 `Stud7Rules`로 구현합니다. 삥·따당·쿼터·하프·풀의 정확한 금액 계산과 라운드별 사용 가능 조건은 2단계 시작 전에 가정을 정리해 보여 드립니다.
- 훌라: 4단계 시작 전에 가정한 규칙 문서를 먼저 작성해 확인받습니다.
- 홀덤 홀수 칩: 기본안은 "딜러 버튼 왼쪽에서 가장 가까운 승자에게 1칩씩"입니다(설정으로 분리).
