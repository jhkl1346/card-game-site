# 카드 게임 사이트 (card-game-site)

하나의 사이트에서 **7포커(Seven Card Stud), 텍사스 홀덤(Texas Hold'em), 훌라(Hula)** 를 골라 플레이할 수 있는 웹 카드게임 서비스입니다.

- 싱글 플레이: 컴퓨터(봇)와 대전
- 멀티 플레이: 실시간 방 생성/입장, 빈자리는 봇으로 채우기
- 아이디/비밀번호 로그인, 칩·전적·닉네임 영구 저장
- 칩은 **가상 재화**이며 실제 돈과 연결되지 않습니다.

> 진행 상황: 1단계(monorepo, CI, 카드·덱·셔플, 족보 판정기)까지 구현했습니다. 배포 방법, 게임별 규칙 요약, 무료 서비스 한도는 이후 단계에서 채웁니다.

## 문서
- [`PROMPT.md`](PROMPT.md): 전체 요구사항
- [`CLAUDE.md`](CLAUDE.md): 작업할 때 항상 지킬 핵심 규칙
- [`PRODUCT.md`](PRODUCT.md): 사용자, 제품 목적, 화면 설계 원칙
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): 폴더 구조, 데이터 모델, 인증 흐름, 소켓 이벤트 설계
- [`CONTRIBUTING.md`](CONTRIBUTING.md): 브랜치·커밋 규칙
- [`ASSETS.md`](ASSETS.md): 에셋 출처와 라이선스

## 폴더 구조
```
apps/web              프론트엔드 (React + TypeScript + Vite)
apps/server           백엔드 (Node.js + TypeScript, Socket.IO 예정)
packages/game-core    서버·클라이언트 공유 게임 로직 (카드, 셔플, 족보 판정기)
```

## 실행 방법
필요한 도구: Node.js 22 이상, pnpm (`npm install -g pnpm`)

```bash
pnpm install
```

```bash
pnpm dev:web
```
→ http://localhost:5173

```bash
pnpm dev:server
```
→ http://localhost:3001/health

환경 변수는 `.env.example`을 복사해 `.env`로 만든 뒤 채웁니다. `.env`는 커밋하지 않습니다.

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

`pnpm test`에는 족보 판정 **전수 테스트**(5장 조합 2,598,960가지의 족보별 개수 검증)가 들어 있으며, 몇 초 안에 끝납니다.

## 기술 스택 (모두 무료/오픈소스)
- 프론트엔드: React, Vite (Tailwind CSS, Framer Motion은 7단계에서 추가)
- 백엔드: Node.js, Socket.IO
- 공통 게임 로직: `packages/game-core` (순수 TypeScript, Node/브라우저 API 의존 없음)
- DB: 로컬 SQLite / 배포 외부 무료 PostgreSQL (5단계, 9단계에서 확정)
- 테스트: Vitest / 린트: ESLint + typescript-eslint / CI: GitHub Actions
- TypeScript는 typescript-eslint 호환을 위해 6.0대로 고정했습니다.

## 브랜치/커밋 규칙
- `main`에 직접 푸시하지 않고 `feature/단계-기능명` 브랜치 → PR → CI 통과 → squash merge
- 커밋 메시지: Conventional Commits 형식, 한국어 (`feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`)
- `.env`, DB 파일, 토큰, 접속 문자열 등 비밀 값은 커밋하지 않습니다.

자세한 내용은 [`CONTRIBUTING.md`](CONTRIBUTING.md)를 참고하세요.

## CI (GitHub Actions)
PR과 `main` 푸시마다 설치 → 린트 → 타입 검사 → 테스트 → 빌드를 실행합니다(`.github/workflows/ci.yml`).
- pnpm 의존성 캐시를 쓰고, 같은 브랜치의 이전 실행은 자동으로 취소해 비공개 저장소의 월 무료 실행 시간을 아낍니다.

## `main` 브랜치 보호 (수동 설정 안내)
GitHub 무료 요금제에서는 **비공개 저장소에 브랜치 보호 규칙을 설정할 수 없습니다**. API로 시도했을 때 "Upgrade to GitHub Pro or make this repository public" 응답을 받았습니다.
그래서 지금은 "PR로만 합치기" 규칙을 작업 방식으로 지킵니다. 나중에 저장소를 공개로 바꾸거나 요금제가 바뀌면 아래처럼 설정하세요.

1. 저장소 → **Settings** → **Branches** (또는 **Rules → Rulesets**)
2. `main`에 규칙 추가
   - **Require a pull request before merging** 켜기
   - **Require status checks to pass** 켜기 → `설치 · 린트 · 타입 검사 · 테스트 · 빌드` 선택
   - **Require branches to be up to date before merging** 켜기
3. 저장

## 라이선스
[MIT](LICENSE)
