# 카드 게임 사이트 (card-game-site)

하나의 사이트에서 **7포커(Seven Card Stud), 텍사스 홀덤(Texas Hold'em), 훌라(Hula)** 를 골라 플레이할 수 있는 웹 카드게임 서비스입니다.

- 싱글 플레이: 컴퓨터(봇)와 대전
- 멀티 플레이: 실시간 방 생성/입장, 빈자리는 봇으로 채우기
- 아이디/비밀번호 로그인, 칩·전적·닉네임 영구 저장
- 칩은 **가상 재화**이며 실제 돈과 연결되지 않습니다.

> 진행 상황: 7단계(화면: 로그인·로비·방 설정·3개 게임 테이블·족보표)까지 구현했습니다. 배포 방법, 무료 서비스 한도는 이후 단계에서 채웁니다.

## 문서
- [`PROMPT.md`](PROMPT.md): 전체 요구사항
- [`CLAUDE.md`](CLAUDE.md): 작업할 때 항상 지킬 핵심 규칙
- [`PRODUCT.md`](PRODUCT.md): 사용자, 제품 목적, 화면 설계 원칙
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): 폴더 구조, 데이터 모델, 인증 흐름, 소켓 이벤트 설계
- [`docs/rules/stud7.md`](docs/rules/stud7.md): 7포커 규칙과 가정 (`Stud7Rules`)
- [`docs/rules/holdem.md`](docs/rules/holdem.md): 텍사스 홀덤 규칙과 가정 (`HoldemRules`)
- [`docs/rules/hula.md`](docs/rules/hula.md): 훌라 규칙과 가정 (`HulaRules`)
- [`CONTRIBUTING.md`](CONTRIBUTING.md): 브랜치·커밋 규칙
- [`ASSETS.md`](ASSETS.md): 에셋 출처와 라이선스

## 폴더 구조
```
apps/web              프론트엔드 (React + TypeScript + Vite)
apps/server           백엔드 (Node.js + TypeScript, Fastify, Socket.IO, Drizzle ORM)
packages/game-core    서버·클라이언트 공유 게임 로직 (카드, 셔플, 족보 판정기, 게임 엔진, 봇)
```

## 실행 방법
필요한 도구: Node.js 22 이상, pnpm (`npm install -g pnpm`)

```bash
pnpm install
```

서버와 화면을 각각 다른 터미널에서 켭니다.

```bash
pnpm dev:server
```
→ http://localhost:3001/health

```bash
pnpm dev:web
```
→ http://localhost:5173 (회원가입 후 로비에서 `혼자 하기`로 봇과 바로 칠 수 있습니다)

- 개발 서버(Vite)가 `/api`, `/health`, `/socket.io` 요청을 3001번 포트로 넘겨 주므로 프론트엔드 환경 변수는 필요 없습니다.
- 프론트와 서버를 다른 도메인에 배포할 때만 `apps/web/.env`에 `VITE_SERVER_URL`(서버 주소)을 적습니다.
- 화면은 휴대폰 가로 화면을 우선으로 만들었습니다. 게임 테이블은 844×390 크기로 그린 뒤 창 크기에 맞춰 확대·축소합니다.

### 화면 (apps/web)
- React 19 + Vite, Tailwind CSS v4(색·글꼴 토큰은 `src/index.css`의 `@theme`), Framer Motion(카드 분배·칩 이동·번 카드 애니메이션, 동작 줄이기 설정을 따름)
- `src/screens`: 로그인·회원가입, 로비, 게임 화면 / `src/table`: 게임별 테이블 / `src/components`: 카드·아이콘·대화상자·방 설정·족보표
- 화면은 서버가 보낸 스냅샷만 그리며, 버튼은 서버가 허용한 액션(`legalActions`)만 보여 줍니다.
- 디자인 방향(옻칠 교자상 + 자개)의 시안은 [`docs/design/a-jagae-chosen.html`](docs/design/a-jagae-chosen.html), 예비 시안은 [`docs/design/d-mobile-poker-backup.html`](docs/design/d-mobile-poker-backup.html)에 있습니다.

환경 변수는 `.env.example`을 복사해 `.env`로 만든 뒤 채웁니다. `.env`는 커밋하지 않습니다.

### DB
- 로컬에서는 **PGlite**(설치가 필요 없는 PostgreSQL)를 씁니다. `DATABASE_URL`을 비워 두면 `apps/server/data/pglite` 폴더에 데이터가 저장되고, 서버가 시작할 때 마이그레이션이 자동으로 적용됩니다. 이 폴더는 커밋하지 않습니다. 초기화하려면 서버를 끄고 폴더를 지우면 됩니다.
- 배포에서는 `DATABASE_URL`에 외부 무료 PostgreSQL 접속 문자열을 넣습니다(9단계에서 확정). 로컬과 같은 스키마·마이그레이션을 씁니다.
- 스키마(`apps/server/src/db/schema.ts`)를 바꾸면 마이그레이션 SQL을 새로 만들어 함께 커밋합니다.
```bash
pnpm --filter @card-game/server db:generate
```

### 인증 API
| 요청 | 설명 |
|---|---|
| `POST /api/auth/signup` | 회원가입 (아이디·비밀번호·비밀번호 확인·닉네임) 후 바로 로그인, 기본 칩 10,000개 |
| `GET /api/auth/check-username`, `check-nickname` | 실시간 중복 확인 |
| `POST /api/auth/login` | 로그인 (`remember`: 로그인 상태 유지). 다른 곳의 기존 로그인은 끊깁니다 |
| `GET /api/auth/me` | 쿠키로 자동 로그인, 내 정보·칩 잔액 |
| `POST /api/auth/logout` | 로그아웃 (서버 세션 삭제) |
| `PATCH /api/account/nickname` | 닉네임 변경 |
| `POST /api/account/password` | 비밀번호 변경 (현재 비밀번호 확인) |
| `POST /api/account/delete` | 회원 탈퇴 (비밀번호 확인, 전적은 익명 처리) |

- 비밀번호는 argon2id 해시로만, 세션 토큰은 SHA-256 해시로만 DB에 저장합니다.
- 세션 쿠키는 `HttpOnly`, `SameSite=Lax`, 배포에서는 `Secure`입니다. 로그인 상태 유지를 켜면 30일(접속할 때마다 연장), 끄면 브라우저를 닫을 때 사라집니다.
- 로그인 5번 실패 시 그 아이디와 IP를 15분간 잠급니다. 실패 메시지는 항상 "아이디 또는 비밀번호가 올바르지 않습니다."입니다.
- 비밀번호 찾기는 없습니다(이메일을 받지 않음). 비밀번호를 잊으면 복구할 수 없습니다.

### 지갑 API
| 요청 | 설명 |
|---|---|
| `GET /api/wallet` | 지갑 잔액, 테이블 칩, 구제 칩을 받을 수 있는지 |
| `POST /api/wallet/relief` | 구제 칩 5,000개 받기 (잔액이 정확히 0이고 테이블 칩도 없을 때만, 횟수 제한 없음) |

### 내 정보·전적·랭킹 API
| 요청 | 설명 |
|---|---|
| `GET /api/stats/me` | 게임별 누적 전적(판 수·승리·칩 증감·한 판 최고), 합계, 최근 20판 |
| `GET /api/ranking` | 칩 랭킹 상위 50명 (지갑 + 테이블 칩). 내가 50위 밖이면 내 순위를 따로 줌 |
| `PATCH /api/account/nickname` | 닉네임 변경 (방 밖에서만) |
| `POST /api/account/password` | 비밀번호 변경 (현재 비밀번호 확인, 다른 기기 로그인 종료) |
| `POST /api/account/delete` | 회원 탈퇴 (비밀번호 확인, 전적은 "탈퇴회원"으로 익명 처리) |

- "승리"는 그 판에서 칩을 딴 경우(칩 증감 > 0)로 셉니다.
- 판별 기록은 90일 동안 보관하고 서버가 1시간마다 정리합니다. 게임별 누적 전적은 지우지 않습니다. 숫자는 `RecordsConfig`(`apps/server/src/config/records.ts`)에 있습니다.

### 게임 서버 (Socket.IO)
- 같은 포트에서 Socket.IO로 방 만들기·입장·빠른 입장·혼자 하기·관전·강퇴·방장 넘기기·게임 액션·채팅을 처리합니다. 이벤트 목록은 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) 4장에 있습니다.
- 셔플·분배·승패 판정은 서버에서만 하고, 사람마다 자기 시야로 만든 스냅샷만 보냅니다(상대 카드·덱·번 카드는 전송하지 않음).
- 칩: 앉을 때 바이인만큼 지갑에서 빠지고, 판이 끝날 때마다 결과를 한 트랜잭션으로 기록하며(같은 판 중복 정산 방지), 일어날 때 테이블 칩이 지갑으로 돌아옵니다. 서버가 재시작되면 진행 중이던 판은 무효가 되고 판 시작 전 칩으로 환불됩니다.
- 채팅은 방 안에서만 되고 DB에 저장하지 않습니다. 200자, 1초에 한 번까지입니다. 지인끼리 쓰는 용도라 채팅 내용은 거르지 않고 그대로 전달합니다(닉네임의 욕설 금지는 유지). 이모티콘 18종(반응·놀리기)은 한 번 눌러 보낼 수 있고 자리 위 말풍선으로도 잠깐 보입니다.
- 효과음(카드 분배·칩·내 차례·이김·채팅)은 음원 파일 없이 Web Audio로 만들며, 로비와 게임 화면의 스피커 버튼으로 켜고 끕니다(이 브라우저에 저장).
- 접속이 끊기면 30초 동안 자리를 지키고, 그 뒤에는 봇이 대신합니다. 같은 계정으로 다시 접속하면 방으로 돌아갑니다. 다른 곳에서 로그인하면 기존 접속은 끊깁니다.
- 숫자 제한(최대 방 수, 관전자 수, 채팅, 요청 빈도, 턴 시간 등)은 `apps/server/src/config/limits.ts`의 `ServerLimits`에 있습니다.

## 테스트와 검사
```bash
pnpm lint
```
```bash
pnpm typecheck
```
```bash
pnpm test
```
```bash
pnpm build
```

### 터미널 시뮬레이터
봇끼리 한 판을 치며 분배·베팅·결과를 출력합니다.
```bash
pnpm sim:stud7
```
여러 판을 돌려 액션 비율과 칩 보존을 확인하려면:
```bash
pnpm sim:stud7 --players 5 --games 500
```
홀덤은 같은 테이블에서 여러 판을 이어 치며 버튼 회전과 칩 이동을 확인합니다.
```bash
pnpm sim:holdem
```
```bash
pnpm sim:holdem --players 9 --hands 1000
```
훌라는 한 판의 가져오기·등록·버리기 과정을 출력하고, 여러 판이면 종료 사유 비율을 보여 줍니다.
```bash
pnpm sim:hula
```
```bash
pnpm sim:hula --players 4 --games 500
```

`pnpm test`에는 족보 판정 **전수 테스트**(5장 조합 2,598,960가지의 족보별 개수 검증)와 서버 테스트(인증, 지갑·구제 칩, 방 진행, Socket.IO 통합. 메모리 PGlite 사용)가 들어 있으며, 몇십 초 안에 끝납니다.

## 게임 규칙 요약
### 7포커 (2~5인)
- 앤티를 내고 3장(비공개 2 + 공개 1)을 받은 뒤, 공개 카드를 한 장씩 더 받아 총 7장(7번째는 비공개)이 됩니다. 베팅은 3·4·5·6·7장째에 한 번씩 총 5번입니다.
- 액션: 삥(기본 단위), 체크, 콜, 따당(직전 증가분만큼 더), 쿼터·하프·풀(콜한 뒤 판돈의 1/4·1/2·전부만큼 더), 다이
- 한 라운드에 한 사람당 레이즈 2번까지, 첫 라운드는 공개 카드가 가장 낮은 사람부터, 이후는 공개 패가 가장 높은 사람부터 시작합니다.
- 7장 중 최고 5장으로 승부하고, 완전 동점이면 팟을 나눕니다. 자세한 내용은 [`docs/rules/stud7.md`](docs/rules/stud7.md)를 참고하세요.

### 텍사스 홀덤 (2~9인, No-Limit)
- 딜러 버튼 왼쪽이 스몰·빅블라인드를 내고(헤즈업은 버튼이 SB), 홀카드 2장과 보드 5장(플랍 3 → 턴 1 → 리버 1)으로 승부합니다.
- 액션: 폴드, 체크, 콜, 벳(최소 BB), 레이즈(최소: 현재 베팅 + 직전 증가분), 올인. 최소 레이즈에 못 미치는 올인은 이미 액션한 사람에게 레이즈 권리를 다시 주지 않습니다.
- 플랍·턴·리버를 펼치기 전마다 번 카드 1장을 버립니다(`HoldemRules`). 번 카드는 서버에만 있고 화면에는 장수만 보입니다.
- 동점이면 팟을 나누고, 남는 칩은 버튼 왼쪽에서 가까운 승자부터 줍니다. 자세한 내용은 [`docs/rules/holdem.md`](docs/rules/holdem.md)를 참고하세요.

### 훌라 (2~4인)
- 각자 7장을 받고, 차례마다 덱이나 버린 더미에서 1장 가져오기 → 멜드 등록·붙이기 → 1장 버리기를 합니다.
- 멜드: 같은 숫자 3~4장(세트), 같은 무늬 연속 3장 이상(런, A는 A-2-3·Q-K-A 모두 가능). 7은 한 장만으로도 등록할 수 있고, 누구의 멜드에든 붙일 수 있습니다.
- 버린 더미 맨 위 카드는 그 턴에 바로 멜드에 쓸 때만 가져올 수 있습니다.
- 손패를 먼저 모두 털면 승리하고, 한 번도 등록하지 않다가 한 번에 전부 털면 "훌라"로 2배를 받습니다.
- 가져오기 전 손패 점수가 10점 이하면 "스톱"을 선언할 수 있습니다. 실패하면 자기 점수의 2배를 냅니다.
- 정산은 남은 손패 점수 × 점당 칩입니다(A=1, J/Q/K=10). 자세한 내용은 [`docs/rules/hula.md`](docs/rules/hula.md)를 참고하세요.

### 봇
- 난이도는 중상급 하나로 고정입니다. 수치(실수 확률 12%, 블러프 빈도, 공격성, 생각 시간 0.8~2.5초)는 `packages/game-core/src/bots/config.ts`의 `BotConfig`에 모여 있습니다.
- 봇은 자기 시야(`getState`)만 입력으로 받으므로 상대 비공개 카드나 덱을 볼 수 없습니다.
- 훌라 봇은 공개된 카드(버린 더미·멜드)를 추적해 이미 많이 나온 숫자는 버리고, 짝·이웃 카드는 남기며, 남이 붙일 수 있는 카드는 되도록 버리지 않습니다.

## 기술 스택 (모두 무료/오픈소스)
- 프론트엔드: React, Vite (Tailwind CSS, Framer Motion은 7단계에서 추가)
- 백엔드: Node.js, Fastify, Socket.IO, Drizzle ORM, argon2id(@node-rs/argon2), zod
- 공통 게임 로직: `packages/game-core` (순수 TypeScript, Node/브라우저 API 의존 없음)
- DB: 로컬 PGlite / 배포 외부 무료 PostgreSQL (서비스는 9단계에서 확정). 원래 계획은 로컬 SQLite였지만, 스키마를 한 벌로 관리하려고 5단계에서 PGlite로 바꿨습니다.
- 테스트: Vitest / 린트: ESLint + typescript-eslint / CI: GitHub Actions
- TypeScript는 typescript-eslint 호환을 위해 6.0대로 고정했습니다.

## 브랜치/커밋 규칙
- `main`에 직접 푸시하지 않고 `feature/단계-기능명` 브랜치 → PR → CI 통과 → squash merge
- 커밋 메시지: Conventional Commits 형식, 한국어 (`feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`)
- `.env`, DB 파일, 토큰, 접속 문자열 등 비밀 값은 커밋하지 않습니다.

자세한 내용은 [`CONTRIBUTING.md`](CONTRIBUTING.md)를 참고하세요.

## CI (GitHub Actions)
PR과 `main` 푸시마다 설치 → 린트 → 타입 검사 → 테스트 → 빌드를 실행합니다(`.github/workflows/ci.yml`).
- pnpm 의존성 캐시를 쓰고, 같은 브랜치의 이전 실행은 자동으로 취소합니다. (공개 저장소는 GitHub 호스팅 러너 사용이 무료이지만, 다시 비공개로 바꿀 경우에 대비해 가볍게 유지합니다.)

## `main` 브랜치 보호
저장소가 공개(public)이므로 무료 요금제에서도 브랜치 보호를 쓸 수 있고, `gh api`로 아래 규칙을 설정해 두었습니다.

| 규칙 | 설정 |
|---|---|
| PR로만 합치기 | 필수 (리뷰 승인 수 0, 혼자 개발하므로 승인 없이 병합 가능) |
| 필수 CI 검사 | `설치 · 린트 · 타입 검사 · 테스트 · 빌드` 통과 |
| 병합 전 최신 `main` 반영 | 필수 |
| 선형 이력 | 필수 (squash merge만 사용) |
| 강제 푸시 / 브랜치 삭제 | 금지 |
| 관리자에게도 적용 | 아니요 (긴급 상황에서 저장소 소유자는 예외 가능) |

확인하거나 바꾸려면 저장소 → **Settings** → **Branches**에서 `main` 규칙을 엽니다.

> 저장소를 다시 비공개로 바꾸면 무료 요금제에서는 브랜치 보호가 동작하지 않습니다. 그때는 "PR로만 합치기"를 작업 방식으로 지킵니다.

## 라이선스
[MIT](LICENSE)
