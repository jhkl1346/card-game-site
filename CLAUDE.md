# 프로젝트 규칙
요구사항: `PROMPT.md` 우선, 단계마다 재확인.

## 기술 스택
- pnpm 모노레포, TypeScript, Node 22+
- 웹: React 19, Vite, Tailwind v4, Framer Motion
- 서버: Fastify, Socket.IO, PGlite
- 테스트: Vitest

## 폴더 구조
- `apps/web` — 화면 (`screens`, `table`, `components`)
- `apps/server` — 방·소켓·인증·지갑·DB
- `packages/game-core` — 게임 엔진·봇 (`stud7`, `holdem`, `hula`, `bots`)
- `docs/rules` — 규칙 가정 문서

## 핵심 규칙
- 무료만 사용
- 셔플·분배·판정은 서버만
- 비공개 카드 전송 금지
- 정산: 트랜잭션 1회, 중복 방지
- 구제 칩: 잔액 0일 때만, 서버 검증
- 비밀번호: argon2id/bcrypt 해시만
- 봇: 중상급 고정, `BotConfig`, 비공개 카드 안 봄
- 불확실한 규칙 → `Stud7Rules`·`HulaRules` 설정 + 가정 명시

## Git
- `feature/단계-기능명` → PR → CI → squash merge
- `main` 직접 푸시 금지
- 커밋: Conventional Commits, 한국어
- 비밀 값 커밋 금지, `git diff --cached` 확인
- GitHub 로그인: 코드·URL만 안내

## 먼저 확인받기
- 공개 전환, 강제 푸시, 이력 재작성, 삭제
- 외부 가입, 결제, 유료 전환
- 다른 저장소, 전역 Git/`gh` 설정

## 응답
- 한국어, 영어 용어는 괄호
- 단계 끝: 만든 것·실행 방법·PR 주소
