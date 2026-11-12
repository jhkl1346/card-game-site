# 카드 게임 사이트 (card-game-site)

하나의 사이트에서 **7포커(Seven Card Stud), 텍사스 홀덤(Texas Hold'em), 훌라(Hula)** 를 골라 플레이할 수 있는 웹 카드게임 서비스입니다.

- 싱글 플레이: 컴퓨터(봇)와 대전
- 멀티 플레이: 실시간 방 생성/입장, 빈자리는 봇으로 채우기
- 아이디/비밀번호 로그인, 칩·전적·닉네임 영구 저장
- 칩은 **가상 재화**이며 실제 돈과 연결되지 않습니다.

> 현재 0단계(환경 준비)만 완료된 상태입니다. 실행 방법, 배포 방법, 게임 규칙 요약, 무료 서비스 한도는 이후 단계에서 채워집니다.

## 요구사항 문서
- [`PROMPT.md`](PROMPT.md): 전체 요구사항
- [`CLAUDE.md`](CLAUDE.md): 작업 시 항상 지킬 핵심 규칙

## 기술 스택 (모두 무료/오픈소스)
- 프론트엔드: React + TypeScript + Vite, Tailwind CSS, Framer Motion
- 백엔드: Node.js + TypeScript, Socket.IO
- 공통 게임 로직: `packages/game-core` (순수 TypeScript)
- DB: 로컬 SQLite / 배포 외부 무료 PostgreSQL
- 테스트: Vitest, CI: GitHub Actions

## 브랜치/커밋 규칙
- `main`에 직접 푸시하지 않고 `feature/단계-기능명` 브랜치 → PR → CI 통과 → squash merge
- 커밋 메시지: Conventional Commits 형식, 한국어 (`feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`)
- `.env`, DB 파일, 토큰, 접속 문자열 등 비밀 값은 커밋하지 않습니다. (`.env.example` 참고)
