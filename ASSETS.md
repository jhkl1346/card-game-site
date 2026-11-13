# 에셋 출처와 라이선스

이 프로젝트는 무료로 사용이 허용된 에셋만 씁니다. 실제 카드 게임사의 디자인이나 저작권이 있는 이미지는 쓰지 않습니다.
새 에셋을 추가할 때는 아래 표에 출처와 라이선스를 반드시 기록합니다.

| 에셋 | 종류 | 출처 | 라이선스 | 비고 |
|---|---|---|---|---|
| 카드 앞면·뒷면, 조커 | SVG/CSS | 직접 제작 (`apps/web/src/components/PlayingCard.tsx`) | MIT (이 저장소) | 뒷면은 옻칠 바탕에 자개 무늬를 CSS 그라디언트로 그림 |
| 무늬 4종 (스페이드·하트·다이아·클로버) | SVG | 직접 제작 (`PlayingCard.tsx`의 `SuitIcon`) | MIT (이 저장소) | |
| 아이콘 (규칙, 나가기, 닫기, 사람, 봇, 자물쇠, 왕관, 채팅, 스피커 등), 칩 표시 | SVG | 직접 제작 (`apps/web/src/components/Icon.tsx`) | MIT (이 저장소) | |
| 효과음 (카드 분배, 칩, 내 차례, 이김, 채팅) | Web Audio 합성 | 직접 제작 (`apps/web/src/lib/sound.ts`) | MIT (이 저장소) | 음원 파일 없음, 브라우저에서 짧은 음을 만들어 재생 |
| 이모티콘 (👍 😂 🤪 🤡 🐔 💩 등 18종) | 유니코드 문자 | 사용자 기기의 시스템 이모지 글꼴 | - | 이미지 파일 없음 |
| 파비콘 | SVG | 직접 제작 (`apps/web/public/favicon.svg`) | MIT (이 저장소) | |
| 교자상 테이블, 자개 테두리 | CSS | 직접 제작 (`apps/web/src/index.css`, `apps/web/src/table/common.tsx`) | MIT (이 저장소) | 이미지 파일 없음 |
| Noto Sans KR (본문) | 웹폰트 | Google Fonts / npm `@fontsource/noto-sans-kr` | SIL OFL 1.1 | 빌드에 포함해 직접 제공 (외부 요청 없음) |
| Gowun Batang (제목) | 웹폰트 | Google Fonts / npm `@fontsource/gowun-batang` | SIL OFL 1.1 | 빌드에 포함해 직접 제공 |

## 허용 라이선스
- 직접 제작 (이 저장소의 MIT 라이선스)
- CC0, MIT, SIL Open Font License(OFL), Apache-2.0

## 사용하지 않는 것
- 유료 폰트·아이콘·효과음, 출처를 알 수 없는 이미지
- 실제 카드 게임사·카지노 브랜드의 디자인
