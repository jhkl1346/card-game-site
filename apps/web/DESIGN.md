---
name: 함께 치는 카드 게임
description: 옻칠 교자상 위에 자개를 두른, 지인끼리 가상 칩으로 즐기는 7포커·텍사스 홀덤·훌라 테이블
colors:
  lacquer: "#16110f"
  lacquer-2: "#231a16"
  lacquer-3: "#2e231d"
  rim: "#7a1f22"
  rim-deep: "#4a1214"
  gold: "#e2c27d"
  gold-soft: "#b89a5c"
  floor: "#3a2418"
  floor-deep: "#24160f"
  ivory: "#f5eedf"
  ivory-dim: "#d9cfbb"
  muted: "#cbbfa8"
  ink: "#1c1714"
  suit-red: "#a3262a"
  danger: "#ff9f95"
  ok: "#a8d8b0"
typography:
  display:
    fontFamily: "Gowun Batang, Noto Sans KR, serif"
    fontSize: "clamp(1.75rem, 4vw, 2.5rem)"
    fontWeight: 700
    lineHeight: 1.25
  headline:
    fontFamily: "Gowun Batang, Noto Sans KR, serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.3
  title:
    fontFamily: "Gowun Batang, Noto Sans KR, serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.3
  pot-number:
    fontFamily: "Noto Sans KR, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 900
    lineHeight: 1
  body:
    fontFamily: "Noto Sans KR, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.6
  label:
    fontFamily: "Noto Sans KR, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.35
  caption:
    fontFamily: "Noto Sans KR, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.25
rounded:
  card-xs: "3px"
  card-sm: "5px"
  card-md: "6px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  2xl: "16px"
  table: "26px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  band: "14px"
  lg: "16px"
  xl: "20px"
components:
  button-primary:
    backgroundColor: "{colors.rim}"
    textColor: "{colors.gold}"
    rounded: "{rounded.lg}"
    padding: "0 16px"
    height: "44px"
  button-primary-active:
    backgroundColor: "{colors.rim-deep}"
  button-quiet:
    backgroundColor: "{colors.lacquer-3}"
    textColor: "{colors.ivory}"
    rounded: "{rounded.lg}"
    padding: "0 16px"
    height: "44px"
  button-ghost:
    textColor: "{colors.gold}"
    rounded: "{rounded.lg}"
    padding: "0 12px"
    height: "40px"
  act-button:
    backgroundColor: "{colors.lacquer-3}"
    textColor: "{colors.ivory}"
    rounded: "{rounded.lg}"
    padding: "0 12px"
    height: "46px"
    width: "72px"
  act-button-primary:
    backgroundColor: "{colors.rim}"
    textColor: "{colors.gold}"
  input:
    backgroundColor: "{colors.lacquer}"
    textColor: "{colors.ivory}"
    rounded: "{rounded.lg}"
    padding: "0 12px"
    height: "44px"
  seat-plate:
    textColor: "{colors.ivory}"
    rounded: "{rounded.full}"
    height: "44px"
    width: "126px"
  playing-card-md:
    backgroundColor: "{colors.ivory}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card-md}"
    width: "46px"
    height: "64px"
  dialog:
    backgroundColor: "{colors.lacquer-2}"
    textColor: "{colors.ivory}"
    rounded: "{rounded.2xl}"
    padding: "16px 20px"
---

# Design System: 함께 치는 카드 게임

## Overview

**Creative North Star: "명절 밤의 자개 교자상"**

명절에 식구들이 꺼내 펴는 검은 옻칠 교자상이 이 시스템의 전부입니다. 어두운 나무 바닥(floor) 위에 옻칠 상판(lacquer)이 놓이고, 붉은 칠 테두리(rim)와 그 안쪽의 가는 자개 띠(pearl inlay), 네 귀퉁이의 자개 마름모가 상을 두릅니다. 카드는 상아색 종이에 먹색과 붉은 칠 무늬로 찍히고, 뒷면은 붉은 칠 위에 금색 빗금입니다. 카지노의 초록 펠트, 네온, 금박 칩은 이 세계에 없습니다.

화면은 휴대폰 가로(844×390)를 기준 좌표로 한 고정 무대(Stage)이며, 기기 크기에 맞춰 통째로 확대·축소됩니다. 밀도는 높지만 한 번에 읽을 것은 하나입니다. 내 차례에는 아래 띠 오른쪽의 한 문장("콜 400 하면 계속 · 남은 12초")과 금색 타이머 막대, 큰 버튼 네 개만 보면 됩니다.

움직임은 실제 상 위의 손놀림을 따릅니다. 카드는 덱에서 각 자리로 날아가며 뒤집히고, 베팅 칩은 자리 앞에서 판돈 쪽으로 미끄러져 사라지며, 홀덤의 번 카드(burn card)는 턴·리버 전에 덱 옆으로 엎어져 던져집니다(0.5초). 판이 끝나면 딴 칩이 가운데에서 이긴 사람 자리로 미끄러집니다. 움직임 줄이기(prefers-reduced-motion) 설정에서는 모든 애니메이션과 전환이 사실상 0으로 줄어듭니다.

**Key Characteristics:**
- 옻칠 검정 상판 + 붉은 칠 테두리 + 무지개빛 자개 띠라는 세 겹 재료
- 금색은 "다음 결정, 판돈, 주 버튼"에만 쓰는 희소한 신호
- 제목은 고운바탕(Gowun Batang), 기능 글자는 본고딕(Noto Sans KR) + 고정폭 숫자(tabular-nums)
- 844×390 고정 무대를 통째로 스케일, 휴대폰 가로 우선
- 정중한 존댓말, 가상 칩(play money)만 다룸

## Colors

어둡고 따뜻한 옻칠 계열 바탕에, 붉은 칠과 금색이 재료로서 들어가고, 상아색이 글자와 카드를 맡습니다.

### Primary
- **붉은 칠 (Lacquer Red, rim)**: 교자상 테두리, 주 버튼과 결정 버튼의 바탕, 로그인 탭의 선택 상태, 칩 그림의 몸통. 눌렀을 때는 더 깊은 붉은 칠(rim-deep)로 내려갑니다.
- **자개 금 (Inlay Gold, gold)**: 지금 해야 할 결정(타이머 막대, 내 차례 자리의 테두리·칩 숫자), 판돈 라벨, 주 버튼의 글자·테두리, 화면 제목, 초점 고리(focus ring, 2px). 테두리용 반투명(25~60%)으로 보조 버튼과 입력칸 윤곽에도 쓰입니다.

### Secondary
- **자개 (Mother-of-Pearl, `--pearl`)**: 청록→연보라→옅은 금→하늘빛으로 흐르는 115도 그라데이션. 상판 안쪽 띠, 네 귀퉁이 마름모, 대화상자·결과 배너·선택된 게임 카드의 테두리, 자리의 아바타 원판에만 씁니다. 면을 채우는 것은 아바타 원판과 마름모뿐입니다.

### Tertiary
- **카드 붉은 무늬 (Suit Red, suit-red)**: 하트·다이아와 조커 무늬 전용입니다. 테두리의 rim과 섞어 쓰지 않습니다.

### Neutral
- **옻칠 검정 (lacquer / lacquer-2 / lacquer-3)**: 세 단계의 상판·면. lacquer는 상판 가장자리와 입력칸, lacquer-2는 상판 중심 빛과 대화상자, lacquer-3는 보조 버튼과 작은 배지.
- **나뭇결 바닥 (floor / floor-deep)**: 페이지 바탕. floor 위에 92도 반복 줄무늬로 나뭇결을 깔고, floor-deep은 대화상자 뒤 가림막(75%)에 씁니다.
- **상아 (ivory / ivory-dim)**: 본문 글자와 카드 앞면. ivory-dim은 규칙 설명과 결과 배너의 보조 설명.
- **먹 (ink)**: 카드의 검은 무늬와 상아 위 글자, 선택 영역의 글자.
- **누른 한지 (muted)**: 보조 글자(판돈 단계, 남은 시간 앞 문장, 힌트).
- **상태색 (danger / ok)**: 오류·잃은 칩·남은 시간 25% 미만은 danger, 사용 가능 확인은 ok. 어두운 바탕에서 읽히도록 밝게 잡혀 있습니다.

### Named Rules
**The Gold Means Now Rule.** 금색 면적은 "지금 내가 할 일"과 판돈, 주 버튼에만 갑니다. 차례인 다른 사람은 금색 테두리·타이머 고리·칩 숫자로만 표시하고, 장식으로 금색을 깔지 않습니다.

**The Pearl Is a Line Rule.** 자개는 2px 테두리 띠(pearl-ring, 불투명도 0.75)로 씁니다. 큰 면을 자개로 채우지 않습니다. 예외는 아바타 원판과 상판 귀퉁이 마름모입니다.

## Typography

**Display Font:** Gowun Batang 700 (대체: Noto Sans KR, serif)
**Body Font:** Noto Sans KR 500/700/900 (대체: system-ui, sans-serif)

두 글꼴 모두 @fontsource로 자체 호스팅하며, 한글·라틴 하위 집합의 해당 굵기만 불러옵니다.

**Character:** 붓맛이 남은 바탕체가 상의 이름과 판돈을 부르고, 단단한 본고딕이 숫자와 버튼을 맡습니다. 숫자는 페이지 전체에서 고정폭(tabular-nums)이라 칩이 바뀌어도 자리가 흔들리지 않습니다.

### Hierarchy
- **Display** (Gowun Batang 700, clamp(1.75rem, 4vw, 2.5rem)): 로그인 화면 큰 제목 하나.
- **Headline** (Gowun Batang 700, 18px): 대화상자 제목, 테이블 대기 안내 제목.
- **Title** (Gowun Batang 700, 15~17px): 테이블 상단 "게임 · 방 제목", 로비 게임 이름과 방 목록 제목. 금색.
- **Pot Number** (Noto Sans KR 900, 24px, 줄높이 1): 판돈 숫자. 바뀔 때 1.12배에서 0.3초에 걸쳐 제자리로.
- **Body** (Noto Sans KR 500, 15px, 줄높이 1.6): 설명 문단, 입력칸, 규칙 본문.
- **Label** (Noto Sans KR 500, 13px): 결정 문장, 방 정보, 힌트·오류. 결정 문장 안의 금액과 남은 초는 700, 18px 상아색으로 강조.
- **Caption** (Noto Sans KR 700, 12px): 자리 칩, 덱·버린 카드 수, 딜러 배지. 이 화면의 최소 글자 크기입니다.

### Named Rules
**The Serif Names, Sans Counts Rule.** 바탕체는 이름(게임, 방, 대화상자, 판돈 라벨)에만, 숫자와 조작은 언제나 본고딕입니다.

**The 12px Floor Rule.** 844×390 무대에서도 글자는 12px 아래로 내려가지 않습니다. 유일한 예외는 카드 그림 속 순위 글자와 JOKER 표기입니다.

## Layout

테이블 화면은 844×390 좌표의 고정 무대입니다. 무대는 `min(가로/844, 세로/390, 1.9)` 배율로 통째로 스케일되고, 세로 화면에서는 "가로로 돌리면 더 크게 볼 수 있습니다" 안내가 아래에 붙습니다.

- **상단 막대 (38px)**: 반투명 옻칠(14,10,8 / 78%) 위에 왼쪽 "게임 · 방 제목"(금색 바탕체), 판돈 단계, 판 번호, 입장 코드, 오른쪽 보유 칩과 족보·나가기 버튼(높이 30px, 위아래 7px 터치 확장).
- **상판**: 좌 96, 위 58, 652×206, 모서리 26px. 가운데 기준점(422, 150), 덱(236, 150). 다른 사람 자리는 1~8명 배치표에 따라 상 가장자리에 놓이고, 나를 기준으로 시계 방향으로 돕니다.
- **아래 띠 (112px)**: 투명→진한 옻칠(92%) 그라데이션 위에 왼쪽 내 카드(lg), 내 이름·테이블 칩·현재 족보, 오른쪽 결정 문장 + 타이머 막대(4px) + 결정 버튼 줄. 띠 안쪽 여백 16px, 요소 간격 14px.

로비와 로그인은 무대가 아닌 일반 흐름 레이아웃입니다. 로비는 최대 너비 5xl, 가로 화면에서는 휴대폰에서도 2열(1.05fr / 1fr), 세로 높이 460px 이하에서는 게임 선택 카드가 52px로 줄고 설명을 숨깁니다. 간격은 4px 단위(Tailwind 기본)로 8·12·16px가 주로 쓰입니다.

### Named Rules
**The One Stage Rule.** 테이블 화면의 좌표는 844×390 하나뿐입니다. 기기별로 다시 배치하지 않고 무대 전체를 스케일합니다.

**The 44px Thumb Rule.** 누르는 것은 모두 44px 이상(결정 버튼 46px)입니다. 시각적으로 더 작은 상단 버튼은 보이지 않는 터치 영역으로 44px를 채웁니다.

## Elevation & Depth

그림자는 실제 물건의 무게를 표현하는 부드러운 아래쪽 그림자만 씁니다. 상판은 붉은 칠 7px + 깊은 붉은 칠 2px의 테두리 고리를 그림자 문법(box-shadow spread)으로 두르고 그 아래 큰 그림자를 드리웁니다. 카드, 차례인 자리, 메뉴, 토스트, 대화상자가 각각 한 단계씩 떠 있습니다. 상판 면은 위쪽이 조금 밝은 타원 방사 그라데이션으로 칠의 광택을 냅니다.

### Shadow Vocabulary
- **상판 (table)** (`box-shadow: 0 0 0 7px var(--color-rim), 0 0 0 9px var(--color-rim-deep), 0 14px 22px rgb(0 0 0 / 0.55)`): 교자상과 로비 방 목록 상(5px/7px 변형).
- **카드 (card)** (`box-shadow: 0 3px 6px rgb(0 0 0 / 0.45)`): 모든 카드 앞·뒷면, 덱.
- **떠오른 자리 (lifted)** (`box-shadow: 0 6px 14px rgb(0 0 0 / 0.5)`): 차례인 자리, 이긴 자리. 함께 3px 위로 뜹니다.
- **메뉴·토스트 (popover)** (`box-shadow: 0 8px 20px rgb(0 0 0 / 0.45)`): 자리 관리 메뉴, 알림.
- **대화상자 (modal)** (`box-shadow: 0 18px 40px rgb(0 0 0 / 0.55)`): 대화상자, 로그인 패널.

### Named Rules
**The Real Weight Rule.** 그림자는 언제나 아래로 떨어지는 흐린 검정입니다. 색 있는 빛 번짐이나 딱딱한 오프셋 그림자를 쓰지 않습니다.

## Shapes

옻칠 가구처럼 모서리를 부드럽게 굴립니다. 상판 26px, 대화상자·방 목록·로그인 패널 16px, 게임 선택 카드·결과 배너 12px, 버튼·입력칸 8px, 상단 작은 버튼·탭 6px. 자리 명패와 칩 배지, 아바타는 완전한 원·알약형입니다. 카드 모서리는 크기에 비례(3·5·6·7px)합니다. 자개 마름모는 16px 정사각형을 45도 돌린 것입니다. 빈자리와 빈 보드 칸은 점선 테두리로 "놓일 자리"를 보여 줍니다.

## Components

### Buttons
결정 하나에 한 번의 누름, 칠한 버튼의 단단한 느낌입니다.
- **Shape:** 부드럽게 굴린 모서리(8px), 최소 높이 44px.
- **Primary:** 붉은 칠 바탕, 금색 글자와 1px 금색 테두리. 화면마다 하나(혼자 하기, 로그인, 콜/체크 등 권장 행동). 마우스 올림 시 조금 밝은 붉은 칠, 누름 시 rim-deep.
- **Quiet:** lacquer-3 바탕, 상아 글자, 30% 금색 테두리. 마우스 올림 시 테두리 60%.
- **Ghost:** 투명 바탕, 금색 글자, 45% 금색 테두리, 마우스 올림 시 10% 금색 면. 족보·나가기·로그아웃·코드 입장.
- **Danger:** 투명 바탕, danger 글자와 50% 테두리.
- **Busy / Disabled:** 처리 중에는 글자 앞에 돌아가는 고리, 비활성은 불투명도 40%(결정 버튼 35%).

### Decision Bar (결정 띠, signature)
아래 띠 오른쪽. 한 문장 + 남은 초(18px 상아) + 4px 타이머 막대(금색, 25% 미만이면 danger) + 결정 버튼 줄(ActButton). 결정 버튼은 높이 46px, 최소 너비 72px(넓게 88px, 좁게 60px), 15px 굵은 글자 아래 12px 보조 금액 줄. 누르면 0.95배로 눌립니다. 문장은 aria-live로 읽힙니다.

### Seat Plate (자리 명패, signature)
126×44px 알약형, 94% 옻칠 바탕, 25% 금색 테두리. 왼쪽 34px 자개 원판 아바타(이름 첫 글자 바탕체, 봇은 아이콘), 오른쪽 이름(13px 굵게)과 칩(12px). 차례가 되면 테두리가 금색이 되고 3px 떠오르며, 아바타 둘레에 남은 시간만큼 금색 원뿔 고리(conic-gradient)가 돌고 칩 숫자가 금색이 됩니다. 다이·관전 대기 자리는 50% 불투명. 빈자리는 25% 금색 점선 알약.

### Playing Card (카드)
직접 그린 SVG 무늬의 상아색 카드. 크기 xs 22×31, sm 34×48, md 46×64, lg 62×86. 왼쪽 위 순위와 작은 무늬, 오른쪽 아래 큰 무늬. 뒷면은 붉은 칠 + 금색 45도 빗금 + 2.5px 상아 테두리. 덱에서 날아올 때 -8도에서 바로 서며(spring 420/32), 앞면은 rotateY 90→0으로 0.22초에 뒤집힙니다. 선택된 카드는 12px 올라오고 금색 고리. 나만 보는 카드는 카드 위 바깥에 "숨김" 표시.

### Chips & Pot (칩과 판돈)
칩 그림은 금색 테두리의 붉은 칠 원(ChipMark). 베팅 칩은 자리와 판돈 사이 35% 검정 알약에 금색 숫자로 놓이고, 라운드가 끝나면 0.45초에 판돈 쪽으로 미끄러져 사라집니다. 판돈은 바탕체 금색 라벨 "판 돈" 아래 24px 숫자. 정산 시 딴 금액이 가운데에서 이긴 자리로 1.3초에 미끄러지며(0.2초 지연) 사라집니다.

### Cards / Containers
- **Dialog:** lacquer-2 바탕, 16px 모서리, 자개 테두리 띠, modal 그림자, 머리줄 아래 15% 금색 구분선, 제목은 금색 바탕체 18px. 아래에서 16px 올라오며 흐림이 풀리는 0.28초 등장. Esc·바깥 누름으로 닫고 초점을 되돌립니다.
- **Result Banner:** 상판 아래쪽 470px 폭, 94% 옻칠 + 자개 띠 + 12px 모서리. 줄마다 금색 이름, ivory-dim 근거(족보), xs 카드, 오른쪽 금액. 마지막 줄 "내 칩 +n"은 금색, 잃으면 danger.
- **Lobby Game Picker:** 64px 줄, 12px 모서리, 왼쪽에 그 게임다운 카드 부채(sm). 선택되면 lacquer-2 + 자개 띠 + 금색 이름.

### Inputs / Fields
- **Style:** 44px 높이, lacquer 바탕, 25% 금색 테두리, 8px 모서리, 15px 상아 글자, 금색 커서.
- **Focus:** 테두리가 금색으로. 그 밖의 초점은 전역 2px 금색 바깥선(offset 2px).
- **Error:** 테두리 danger, 아래 13px danger 문장(role=alert). 확인됨은 ok 색 문장.
- **Stepper:** 44px 정사각 −/+ 버튼(lacquer-3, 금색 아이콘) 사이 17px 굵은 숫자.

### Navigation
테이블 상단 막대(38px)와 로비 머리줄이 전부입니다. 로비 머리줄은 금색 바탕체 사이트 이름, 오른쪽 보유 칩 알약(lacquer, 칩 그림 + 15px 굵은 숫자), 조건부 구제 칩 주 버튼, ghost 버튼들.

### Icons
24 격자, 1.8 굵기, 둥근 끝의 직접 그린 선 아이콘(SVG)만 씁니다. 글리프나 이모지 아이콘은 쓰지 않습니다.

## Do's and Don'ts

### Do:
- **Do** 새 화면도 floor 나뭇결 바닥 위에 옻칠 면(lacquer 계열)을 올리고, 큰 면은 rim 고리 + 자개 띠로 두르세요.
- **Do** 금색은 다음 결정·판돈·주 버튼에만 쓰고, 화면당 주 버튼(붉은 칠 + 금색 테두리)은 하나만 두세요.
- **Do** 이름은 Gowun Batang, 숫자와 조작은 Noto Sans KR 고정폭 숫자로 쓰세요.
- **Do** 테이블 요소는 844×390 좌표에 놓고 무대 스케일에 맡기세요.
- **Do** 누르는 것은 44px 이상, 글자는 12px 이상으로 두세요.
- **Do** 움직임은 실제 손놀림(덱에서 분배, 칩 미끄러짐, 번 카드 던지기, 정산 이동)으로만 쓰고, 감속 곡선 cubic-bezier(0.16, 1, 0.3, 1)을 쓰세요. 움직임 줄이기 설정을 지키세요.
- **Do** 문구는 정중한 존댓말로, 칩은 가상 칩임을 분명히 하세요.

### Don't:
- **Don't** 초록 펠트, 네온, 금박 칩 같은 카지노 재료를 쓰지 마세요.
- **Don't** 자개 그라데이션으로 큰 면을 채우지 마세요. 자개는 2px 띠, 아바타 원판, 귀퉁이 마름모뿐입니다.
- **Don't** 금색을 장식용 면이나 일반 텍스트 강조로 퍼뜨리지 마세요.
- **Don't** suit-red(카드 무늬)와 rim(칠 테두리·버튼)을 서로 바꿔 쓰지 마세요.
- **Don't** 색 번짐 그림자나 딱딱한 오프셋 그림자를 쓰지 마세요.
- **Don't** 글리프·이모지 아이콘이나 외부 아이콘 폰트를 쓰지 마세요.
