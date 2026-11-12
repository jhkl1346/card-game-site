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

### 2.2 DB 스키마 (영구 데이터만, 5단계 확정)

실제 정의는 `apps/server/src/db/schema.ts`, 마이그레이션 SQL은 `apps/server/drizzle/`에 있습니다.

| 테이블 | 컬럼 | 비고 |
|---|---|---|
| `users` | id(uuid PK), username(UNIQUE), password_hash, nickname(UNIQUE, 대소문자 무시), email(NULL 허용), created_at, last_login_at, deleted_at(NULL 허용) | 탈퇴 시 username·nickname 익명화, 해시 삭제 |
| `sessions` | id(PK), user_id(FK), token_hash(UNIQUE), expires_at, persistent(bool), user_agent, created_at, last_seen_at | 토큰은 SHA-256 해시만 저장 |
| `wallets` | user_id(PK, FK), balance(bigint, CHECK ≥0), updated_at | |
| `table_stakes` | user_id(PK, FK), room_id, amount(CHECK ≥0) | 테이블에 올라가 있는 칩 (6단계 추가) |
| `game_results` | game_id(PK), game_type, participants(JSONB: id·이름·봇 여부·칩 증감), ended_at | 중복 정산 방지 키 |
| `game_result_players` | (game_id, user_id) PK, chip_delta, rank | 전적·랭킹 조회용 (사람만) |
| `chip_logs` | id, user_id, delta, reason(`signup`/`game`/`relief`/`buyin`/`cashout`/`refund`), game_id(NULL 허용), created_at | |
| `login_attempts` | key(`u:아이디` 또는 `ip:주소`), fail_count, locked_until, updated_at | 5회 실패 시 15분 잠금 |

- `chat_logs`는 무료 DB 용량을 아끼기 위해 기본으로 만들지 않습니다.
- 만료된 `sessions`, 보관 기간이 지난 `game_results`는 서버가 주기적으로 정리합니다.
- 번 카드, 남은 덱, 셔플 시드는 DB에 저장하지 않습니다.
- ORM은 **Drizzle**(Apache-2.0)입니다. 별도 엔진 바이너리 없이 가볍습니다.
- **로컬 DB는 PGlite**(Apache-2.0, WASM으로 동작하는 PostgreSQL)입니다(5단계 확정, 사용자 확인). 처음 계획한 SQLite는 PostgreSQL과 문법이 달라 스키마·마이그레이션·쿼리를 두 벌 관리해야 해서 바꿨습니다. 이제 로컬·테스트·배포가 모두 같은 PostgreSQL 스키마와 마이그레이션 한 벌을 씁니다.
  - `DATABASE_URL`이 비어 있으면 `apps/server/data/pglite` 폴더(커밋하지 않음), `memory://`면 메모리(테스트), `postgres://...`면 외부 PostgreSQL(`pg` 드라이버)에 연결합니다.
  - 서버가 시작할 때 마이그레이션을 자동으로 적용합니다. 스키마를 바꾸면 `pnpm --filter @card-game/server db:generate`로 새 마이그레이션 SQL을 만들어 함께 커밋합니다.
- 칩·전적 컬럼은 `bigint`(JS number로 읽음)입니다. 가상 칩이라 2^53 안에서 충분합니다.

### 2.3 칩 흐름 (6단계 확정, `apps/server/src/wallet/service.ts`)

`table_stakes`(user_id PK, room_id, amount) 테이블이 "지갑에서 빠져 테이블에 올라가 있는 칩"을 기록합니다. 한 사람은 한 방에만 앉을 수 있습니다.

1. **바이인**(자리에 앉을 때): 한 트랜잭션으로 `wallets.balance`를 차감하고 `table_stakes`를 만들고 `chip_logs(buyin)`을 남깁니다. 잔액이 바이인보다 적으면 가진 만큼(최소 판돈 × 20) 앉습니다.
2. **판 진행 중**: 칩 증감은 서버 메모리(엔진 상태)에서만 일어납니다.
3. **판 종료**: 한 트랜잭션으로 `game_results`(game_id PK), `game_result_players`, `chip_logs(game)`을 넣고 `table_stakes.amount`를 판이 끝난 뒤 테이블 칩으로 바꿉니다. `game_id`가 이미 있으면(`ON CONFLICT DO NOTHING`) 아무것도 하지 않으므로 중복 정산되지 않습니다. 지갑 잔액은 이때 바뀌지 않습니다.
4. **일어날 때**(나가기, 강퇴, 칩 소진, 오래 접속하지 않음): 한 트랜잭션으로 `table_stakes`를 지우면서 그 칩을 지갑에 더하고 `chip_logs(cashout)`을 남깁니다. 판 도중 나가면 그 판은 자동 액션(체크/다이, 훌라는 자동 버리기)으로 마친 뒤 일어납니다.
5. **서버 재시작**: 시작할 때 남아 있는 `table_stakes`를 모두 지갑에 환불합니다(`chip_logs(refund)`). 이 값은 마지막으로 끝난 판 기준이므로 곧 "진행 중이던 판이 시작되기 전 칩"입니다. 정상 종료(SIGTERM) 때도 방을 모두 닫으며 같은 방식으로 돌려줍니다.
6. **구제 칩**(`POST /api/wallet/relief`): 방 관리자가 아는 지금 테이블 칩이 0이고, 트랜잭션 안에서 `table_stakes`에 칩이 없고, 조건부 UPDATE(`WHERE balance = 0`)가 성공할 때만 `ReliefChipConfig.amount`(5,000)를 지급합니다. 동시에 여러 번 요청해도 하나만 성공하고, 횟수 제한은 없습니다.
7. 봇의 칩은 지갑과 무관한 가상 칩입니다. 봇이 칩을 다 잃으면 판 사이에 바이인만큼 다시 채웁니다.

## 3. 인증 흐름

```
[가입] POST /api/auth/signup {username, password, passwordConfirm, nickname, remember?}
   → 서버 검증 (아이디 형식·중복, 비밀번호 규칙, 닉네임 길이·중복·금칙어)
   → argon2id 해시 → users + wallets(10,000) + chip_logs(signup) 한 트랜잭션
   → 바로 로그인 처리 (remember 기본값 true)
[중복 확인] GET /api/auth/check-username?username=... , GET /api/auth/check-nickname?nickname=...
[로그인] POST /api/auth/login {username, password, remember}
   → login_attempts 확인 (아이디·IP 각각 5회 실패 시 15분 잠금)
   → 실패 메시지는 항상 "아이디 또는 비밀번호가 올바르지 않습니다"
   → 없는 아이디도 더미 해시를 검증해 응답 시간으로 존재 여부가 드러나지 않게 함
   → 성공: 같은 계정의 기존 세션을 모두 삭제(다른 곳 접속 종료), 무작위 토큰(32바이트) 발급,
     DB에는 SHA-256 해시만 저장
   → Set-Cookie: sid=토큰; HttpOnly; Secure(배포); SameSite=Lax; Path=/
        remember=true → Expires 30일, 요청마다 만료 연장(DB 쓰기는 1시간에 한 번)
        remember=false → 만료 없는 세션 쿠키(브라우저 종료 시 삭제), 서버 쪽 세션은 12시간 슬라이딩 만료
[자동 로그인] GET /api/auth/me → 쿠키 확인 후 사용자 정보(닉네임, 칩 잔액) 반환
[로그아웃] POST /api/auth/logout → DB 세션 삭제 + 쿠키 삭제
[계정 관리] PATCH /api/account/nickname, POST /api/account/password(현재 비밀번호 확인, 다른 세션 종료),
           POST /api/account/delete(비밀번호 확인, 익명화 후 세션·지갑 삭제)
[정리] 서버가 1시간마다 만료된 세션과 오래된 로그인 실패 기록을 삭제
[소켓 인증] Socket.IO 연결 핸드셰이크에서 같은 쿠키를 검증
   → 같은 계정의 기존 소켓이 있으면 "다른 곳에서 로그인되어 접속을 종료합니다" 알림 후 끊고,
     진행 중인 자리는 봇이 대행 → 새 소켓이 방으로 자동 복귀
```

- 비밀번호 해시: `@node-rs/argon2`(MIT, 미리 빌드된 바이너리라 별도 컴파일 불필요)의 argon2id, 비용은 OWASP 권장 최소치(19MiB, 반복 2)입니다. 숫자는 `AuthConfig`(`apps/server/src/config/auth.ts`)에 모았습니다.
- 로그인 실패 제한: 아이디·IP를 따로 세고 DB에 저장합니다(서버 재시작에도 유지). 성공하면 아이디 기록만 지우고 IP 기록은 남겨, 내 계정 로그인으로 IP 카운트를 초기화하며 남의 계정을 찔러 보는 것을 막습니다.
- 개발 중에는 Vite 개발 서버가 `/api`를 백엔드로 프록시해서 같은 출처처럼 동작합니다.
- **도메인 분리 시 쿠키 정책**: 프론트와 백엔드가 서로 다른 무료 도메인이면 쿠키가 제3자(cross-site) 쿠키가 되어 `SameSite=None; Secure`가 필요하고, Safari 등 일부 브라우저에서는 막힐 수 있습니다. 그래서 **백엔드가 빌드된 프론트 정적 파일도 함께 제공하는 단일 도메인 구성**을 1순위로 검토합니다. 이 경우 `SameSite=Lax`를 쓸 수 있고 CORS도 필요 없습니다. 분리 배포가 불가피하면 `SameSite=None` + CORS 허용 출처 고정(`credentials: true`)으로 갑니다. 최종 결정은 9단계 배포 조사에서 합니다(결정 보류).
- 입력 검증은 서버에서 스키마 검증(zod, MIT)으로 하고, SQL은 ORM의 파라미터 바인딩만 씁니다. React의 기본 이스케이프를 그대로 쓰고 `dangerouslySetInnerHTML`은 쓰지 않습니다.

## 4. 소켓 이벤트 명세 (Socket.IO, 6단계 확정)

`apps/server/src/socket/index.ts`. 연결할 때 세션 쿠키로 인증하고(없으면 연결 거부), 클라이언트 → 서버 요청은 ack 콜백으로 `{ ok: true, ... } | { ok: false, error: '한국어 메시지' }`를 돌려받습니다.

| 방향 | 이벤트 | 내용 |
|---|---|---|
| C→S | `lobby:subscribe` / `lobby:unsubscribe` | 공개 방 목록 구독 (응답에 현재 목록) |
| S→C | `lobby:rooms` | 공개 방 목록 (바뀔 때, 0.3초 묶음) |
| C→S | `room:create` | `{ gameType, maxPlayers?, botCount?, buyIn?, stake?, isPrivate?, turnSeconds? }` 빠진 값은 게임별 기본값 |
| C→S | `room:single` | `{ gameType, settings? }` 혼자 하기: 비공개 방에 봇만 채워 바로 시작 |
| C→S | `room:join` | `{ roomId }` 또는 `{ code }`(비공개 방), `spectate: true`면 관전 |
| C→S | `room:quickJoin` | `{ gameType }` 빈자리가 있는 공개 방, 없으면 봇과 새 방 |
| C→S | `room:sit` | 관전 중 빈자리에 앉기 (바이인) |
| C→S | `room:leave` | 나가기. 판 도중이면 `pending: true`, 판이 끝날 때 칩 반환 |
| C→S | `room:start` / `room:kick` / `room:transferHost` | 방장 전용 |
| C→S | `room:resync` | 스냅샷 다시 받기 |
| S→C | `room:snapshot` | 방 정보 + **받는 사람의 시야로 만든** 게임 상태 + 차례·마감 시각(`serverNow` 기준) + `seq`. 상태가 바뀔 때마다 사람마다 따로 보냄 |
| C→S | `game:action` | `{ action }` 차례·형식·규칙 검증, 틀리면 거절 |
| C→S | `chat:send` | `{ text }` 길이·빈도 제한 |
| S→C | `chat:message` | `{ userId, nickname, text, at }` (DB 저장 안 함) |
| S→C | `session:replaced` | 같은 계정의 다른 접속·로그인·로그아웃으로 접속 종료 |
| S→C | `server:notice` | 강퇴, 칩 소진으로 자리에서 일어남 등 안내 |

- 증분 이벤트(`game:event`) 대신 바뀔 때마다 전체 스냅샷을 보냅니다. 스냅샷은 엔진의 시야 함수(`getState`)만 거치므로 비공개 카드가 섞일 수 없고, 재접속·지연 복구도 같은 경로로 됩니다. 카드 분배 같은 애니메이션은 7단계에서 이전 스냅샷과 비교해 그립니다.
- 소켓마다 요청 빈도 제한(초당 10회, 순간 20회)을 둡니다.
- **재접속**: 끊기면 30초 동안 자리를 지키고(차례가 오면 제한 시간대로 자동 액션), 그 뒤에는 봇이 대신 플레이합니다. 판 사이에 끊겨 있으면 바로 일어나 칩을 돌려받습니다. 같은 계정으로 다시 접속하면 방으로 자동 복귀합니다. 3분 넘게 돌아오지 않으면 판이 끝날 때 일어납니다.
- **중복 접속**: 같은 계정이 새로 연결하거나 HTTP로 새로 로그인하면 기존 소켓에 `session:replaced`를 보내고 끊습니다. 자리는 그대로 새 접속이 이어받습니다.
- 턴 타이머가 끝나면 엔진의 시간 초과 액션(체크 또는 폴드/다이, 훌라는 자동 버리기)을 적용합니다.

## 5. 설정 객체

| 이름 | 위치 | 주요 값 |
|---|---|---|
| `Stud7Rules` | game-core | firstRoundStarter, laterRoundStarter, suitRank, tieBreakBySuit |
| `HoldemRules` | game-core | burnBeforeFlop/Turn/River (기본 모두 true), 홀수 칩 처리 |
| `HulaRules` | game-core | 조커, 카드 점수, 스톱, 정산 (4단계 전에 가정 문서로 확인) |
| `BotConfig` | game-core | 실수 확률(10~15%), 블러프 빈도, 공격성, 딜레이 0.8~2.5초 |
| `ServerLimits` | server (`config/limits.ts`) | 최대 방 50, 방당 관전자 10, 채팅 200자·1초 간격, 소켓 요청 초당 10, 재접속 유예 30초, 부재 3분, 다음 판 대기 5초, 턴 10~60초(기본 20) |
| `ReliefChipConfig` | server (`config/auth.ts`) | amount 5,000, requiredBalance 0 |
| `AuthConfig` | server (`config/auth.ts`) | 세션 30일·12시간, 로그인 5회 실패 15분 잠금, 가입 칩 10,000, argon2id 비용 |
| 방 기본값 | server (`rooms/settings.ts`) | 7포커 5인·봇 3·앤티 50, 홀덤 6인·봇 4·BB 100, 훌라 4인·봇 2·점당 10, 바이인 5,000(최소 판돈×20) |

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
| 로컬 DB | PGlite (@electric-sql/pglite) | Apache-2.0 |
| DB 드라이버(배포) | pg (node-postgres) | MIT |
| HTTP 서버 | Fastify, @fastify/cookie | MIT |
| 형상 관리·CI | GitHub, GitHub Actions | 비공개 저장소 무료 실행 시간 한도 내 |
| 배포 | 미정 | 9단계에서 공식 문서로 현재 무료 조건 확인 후 보고 |
| 에셋 | 카드·아이콘 직접 SVG 제작 | `ASSETS.md`에 기록 |

## 8. 규칙 관련 가정과 확인 예정 항목

- 7포커: PROMPT.md의 기본값을 `Stud7Rules`로 구현합니다. 삥·따당·쿼터·하프·풀의 정확한 금액 계산과 라운드별 사용 가능 조건은 2단계 시작 전에 가정을 정리해 보여 드립니다.
- 훌라: 4단계 시작 전에 가정한 규칙 문서를 먼저 작성해 확인받습니다.
- 홀덤 홀수 칩: 기본안은 "딜러 버튼 왼쪽에서 가장 가까운 승자에게 1칩씩"입니다(설정으로 분리).
