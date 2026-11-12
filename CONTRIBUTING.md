# 기여 방법 (브랜치/커밋 규칙)

## 브랜치
- `main`은 항상 실행 가능한 상태로 유지합니다. `main`에 직접 푸시하지 않습니다.
- 작업 브랜치 이름: `feature/단계-기능명` (예: `feature/03-holdem-engine`)
- 버그 수정은 `fix/짧은-설명`을 써도 됩니다.

## 작업 흐름
1. `main`을 최신으로 받고 새 브랜치를 만듭니다.
2. 작은 단위로 커밋합니다. 한 커밋에는 하나의 변경만 담습니다.
3. 커밋 전에 `git diff --cached`로 비밀 값(`.env`, 토큰, DB 접속 문자열, DB 파일)이 없는지 확인합니다.
4. `gh pr create`로 PR을 만들고, 템플릿에 변경 요약·테스트 방법·규칙 설정 변경 여부를 적습니다.
5. CI(린트 → 타입 검사 → 테스트 → 빌드)가 통과하면 squash merge 후 브랜치를 삭제합니다.

## 커밋 메시지
[Conventional Commits](https://www.conventionalcommits.org/ko/) 형식을 쓰고 한국어로 씁니다.

| 접두어 | 용도 |
|---|---|
| `feat:` | 새 기능 |
| `fix:` | 버그 수정 |
| `test:` | 테스트 추가·수정 |
| `docs:` | 문서 |
| `refactor:` | 동작 변화 없는 구조 개선 |
| `chore:` | 설정, 의존성, 빌드 |

예: `feat: 홀덤 사이드팟 계산 추가`

## 로컬 확인 명령
```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
