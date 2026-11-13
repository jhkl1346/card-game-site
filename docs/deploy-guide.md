# 배포 가이드 (Render + Neon, 모두 무료)

구성 근거와 무료 요금제 조건은 [deploy-report.md](deploy-report.md)에 있습니다(2026-11-13 공식 문서 확인).
서버 하나(`https://<이름>.onrender.com`)가 화면, API, 실시간 게임(Socket.IO)을 모두 제공합니다.

> 외부 서비스 가입과 비밀 값 입력은 직접 해 주세요. **결제 수단(카드)은 어디에도 등록하지 않습니다.**
> 결제 수단이 없으면 무료 한도를 넘어도 과금되지 않고 정지만 됩니다.

## 1. Neon에서 DB 만들기
1. https://neon.com 에 GitHub 계정 등으로 가입합니다 (카드 불필요).
2. 새 프로젝트를 만듭니다. **지역은 AWS Asia Pacific (Singapore)** 를 고릅니다(서버와 같은 지역, 나중에 바꿀 수 없음). Postgres 버전은 기본값 그대로 둡니다.
3. 대시보드의 **Connect** 에서 접속 문자열을 복사합니다. `postgresql://...neon.tech/...?sslmode=require` 형태입니다.
   - **Pooled connection**(주소에 `-pooler`가 들어간 것)을 고르세요.
   - 이 문자열에는 비밀번호가 들어 있습니다. 채팅·코드·커밋에 붙여 넣지 말고 다음 단계의 Render 화면에만 넣습니다.

## 2. Render에서 서비스 만들기
1. https://render.com 에 GitHub 계정으로 가입합니다. 결제 수단은 등록하지 않습니다.
2. **New → Blueprint** 를 고르고 이 저장소(`card-game-site`)를 연결합니다. GitHub 연동 화면에서 이 저장소 하나만 접근을 허용하면 됩니다.
3. 저장소의 [`render.yaml`](../render.yaml)을 읽어 아래 설정으로 서비스를 만듭니다.
   - 무료(free) 웹 서비스, 싱가포르 지역, `main` 브랜치, 자동 배포 끔
   - 빌드: `pnpm install` → `pnpm build`, 실행: `node apps/server/dist/index.js`, 상태 확인: `/health`
4. 만들 때 `DATABASE_URL` 값을 물어봅니다. 1단계에서 복사한 Neon 접속 문자열을 붙여 넣습니다.
5. 첫 배포가 끝나면 `https://card-game-site.onrender.com` 같은 주소가 나옵니다(이름이 겹치면 Render가 뒤에 글자를 붙임). 접속해서 회원가입이 되는지 확인합니다.
   - 첫 실행 때 서버가 DB 테이블을 자동으로 만듭니다(마이그레이션).

## 3. 환경 변수

| 이름 | 값 | 설명 |
|---|---|---|
| `DATABASE_URL` | Neon 접속 문자열 | **비밀 값.** Render 화면에서만 입력 |
| `TRUST_PROXY` | `true` | Render 프록시 뒤에서 실제 접속 IP를 읽음 (로그인 실패 제한) |
| `MAX_ROOMS` | `10` | 동시에 열 수 있는 방 수. 무료 서버 메모리(512MB)에 맞춤 |
| `PORT` | (Render가 자동 설정, 기본 10000) | 직접 넣지 않습니다 |
| `NODE_ENV` | `production` | `render.yaml`의 실행 명령에 들어 있음. 빌드 때는 넣지 않습니다(빌드 도구 설치가 빠짐) |
| `WEB_ROOT` | (비워 둠) | 화면 파일 폴더. 비우면 `apps/web/dist`. `off`면 화면을 제공하지 않음 |

`NODE_ENV=production`이면 서버가 자동으로:
- 세션 쿠키에 `Secure`를 붙이고, HSTS 헤더를 보냅니다.
- 다른 사이트에서 연 소켓 연결을 거절합니다(Origin 확인).
- `0.0.0.0`에서 접속을 받습니다.

## 4. 배포하기 (GitHub Actions, 수동 실행)
자동 배포는 꺼 두었습니다. `main`에 합친 뒤 원할 때 배포합니다.

1. Render 서비스의 **Settings → Deploy Hook** 주소를 복사합니다(비밀 값).
2. 이 주소를 GitHub 저장소 시크릿에 등록합니다. 터미널에서 아래 명령을 실행하고, 물어보면 주소를 붙여 넣습니다(화면과 기록에 남지 않음).
   ```bash
   gh secret set RENDER_DEPLOY_HOOK_URL
   ```
3. GitHub 저장소의 **Actions → 배포 → Run workflow** 를 누릅니다. `main` 브랜치에서만 실행됩니다.
   - 터미널에서는 `gh workflow run deploy.yml --ref main`
4. Render 화면의 **Events** 에서 진행 상황을 봅니다. 배포 중에는 접속이 끊겼다가 다시 이어지고, **진행 중이던 판은 무효가 되어 칩이 환불됩니다.**

Render 화면의 **Manual Deploy** 버튼으로 배포해도 됩니다.

## 5. 운영하면서 알아둘 점
- **잠듦**: 15분 동안 아무 접속이 없으면 서버가 잠들고, 다음 첫 접속은 약 1분 걸립니다. 화면에 "서버를 깨우는 중입니다"가 뜹니다. 잠들지 않게 외부에서 계속 호출하는 방법은 쓰지 않습니다(약관에 허용 여부가 없음).
- **재시작**: Render 무료 서버는 언제든 재시작될 수 있습니다. 진행 중이던 판은 무효, 칩은 판 시작 전으로 환불됩니다. 칩·전적은 Neon에 있어 그대로입니다.
- **월 한도**: Render 750시간(서비스 1개면 충분), Neon 프로젝트당 1GB·월 100 CU-시간. 넘으면 그달 동안 정지되거나 쓰기가 막히고 과금되지 않습니다.
- **DB 정리**: 판별 기록은 90일 뒤 자동으로 지웁니다(누적 전적은 유지).
- 무료 조건은 바뀔 수 있습니다. 문제가 생기면 [deploy-report.md](deploy-report.md)의 링크로 현재 조건을 다시 확인하세요.

## 6. 문제 해결
| 증상 | 확인할 것 |
|---|---|
| 빌드 실패 | Render Logs. `NODE_ENV`를 환경 변수에 넣었다면 지우기 (실행 명령에만 있어야 함) |
| "서버 오류" / DB 연결 실패 | `DATABASE_URL`이 Neon의 pooled 주소이고 `sslmode=require`가 붙었는지 |
| 로그인 후 바로 로그아웃됨 | `https://` 주소로 접속했는지 (Secure 쿠키) |
| 배포 워크플로 실패 | `RENDER_DEPLOY_HOOK_URL` 시크릿이 있는지, `main`에서 실행했는지 |
