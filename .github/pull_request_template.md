## 변경 요약
<!-- 무엇을, 왜 바꿨는지 -->

## 관련 이슈
Closes #

## 테스트 방법
<!-- 실행한 명령과 확인한 내용 -->
- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`

## 규칙 설정 변경 여부
<!-- Stud7Rules / HoldemRules / HulaRules / BotConfig / ServerLimits / ReliefChipConfig -->
- [ ] 변경 없음
- [ ] 변경 있음 (아래에 이전 값 → 새 값)

## 확인 사항
- [ ] `.env`, DB 파일, 토큰, 접속 문자열 등 비밀 값이 포함되지 않았습니다 (`git diff --cached` 확인)
- [ ] 비공개 카드(상대 카드, 번 카드, 남은 덱)가 클라이언트로 전송되지 않습니다
