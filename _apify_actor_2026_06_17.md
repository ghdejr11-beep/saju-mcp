# Saju MCP → Apify Actor 변환 요약 (2026-06-17)

기존 stdio MCP 서버(`src/index.ts`, npm/Claude Desktop 무료 경로)를 **건드리지 않고**,
Apify Store에 PPE(pay-per-event) 과금으로 상장 가능한 Actor 경로를 추가했다.
배포·`apify push`·publish는 하지 않음(코드/파일만 제작).

## 추가/변경 파일

| 파일 | 역할 |
|------|------|
| `.actor/actor.json` | Actor 정의 (Standby mode, `webServerMcpPath:/mcp`, env, input schema) |
| `.actor/pay_per_event.json` | PPE 이벤트 정의 (`tool-call` = $0.01/콜) |
| `Dockerfile` | `apify/actor-node:24` 2-stage 빌드 → `dist/actor.js` 실행 |
| `.dockerignore` | node_modules/dist/.git 제외 (이미지 빌드 안전) |
| `src/actor.ts` | **신규** Apify HTTP 진입점 (Streamable HTTP + `Actor.charge()`) |
| `package.json` | deps 추가(`apify`/`express`/`cors`+types), `start:actor` 스크립트 |
| `src/index.ts` | **무변경** — stdio MCP 그대로 보존(npm 경로 B) |

## 두 경로 병행 (기존 안 깨짐)

- **경로 A (Apify Store, 유료 PPE)**: `dist/actor.js` — Streamable HTTP, tool call당 $0.01 과금.
- **경로 B (npm/Claude Desktop, 무료)**: `dist/index.js` — stdio, 무변경. `bin`/`main` 그대로.
- `npm run build` → `dist/index.js` + `dist/actor.js` 둘 다 emit (실측 확인).
- `npx tsc --noEmit` 통과(exit 0).

## 검증된 Apify 패턴 (추측 아님, 공식 템플릿 기준)

출처 = Apify 공식 TS MCP 템플릿 `apify/actor-templates → templates/ts-mcp-empty`
(actor.json / pay_per_event.json / Dockerfile / src/main.ts raw 파일 실측 복제).

- `usesStandbyMode: true` + `webServerMcpPath: "/mcp"` → Actor가 MCP 서버로 인식됨.
- 웹서버 포트 = `process.env.APIFY_CONTAINER_PORT` (Standby가 주입).
- Stateless Streamable HTTP: `new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })`,
  요청마다 새 `McpServer` 생성/연결/종료.
- Readiness probe: `GET /` 에서 `x-apify-container-server-readiness-probe` 헤더 → `ok` 응답.
- `POST /mcp`만 처리, `GET/DELETE /mcp`는 405.
- SSE 단독 transport는 2026 제거됨 → Streamable HTTP 사용(템플릿 일치).

## PPE 과금 (검증됨)

- 이벤트 정의 = `.actor/pay_per_event.json` (event name을 key로 하는 객체):
  ```json
  { "tool-call": { "eventTitle": "...", "eventDescription": "...", "eventPriceUsd": 0.01 } }
  ```
- 코드에서 과금 = `await Actor.charge({ eventName: 'tool-call' })` — 4개 tool 각 핸들러 진입 시 1회 호출.
- 가격 **$0.01/tool call** (본사 제시가; RapidAPI per-req $0.0003~0.01 시장가 cite 참고).
- `eventPriceUsd`(flat)와 `eventTieredPricingUsd`(tier)는 상호배타 — 여기선 flat.
- 파일은 source-of-truth지만 **최종 활성화는 Apify Console Monetization 단계에서 사장님이 확정**
  (Pay-per-event + usage 토글, primary event 선택 후 publish).

## 업스트림 인증 (시크릿 하드코딩 0)

- `SAJU_API_KEY`는 코드에 박지 않음. `actor.json`의
  `"SAJU_API_KEY": "@SAJU_API_KEY"` = Apify **secret 참조**(@ 접두).
- 따라서 push 전 본사가 `apify secrets add SAJU_API_KEY <free키>` 1회 필요.
- free 키 발급: `POST https://saju-api.pages.dev/api/v1/keys/create` (100/day, 카드X).
- `SAJU_API_BASE`는 평문 기본값 `https://saju-api.pages.dev` (시크릿 아님).

## 본사 apify push 절차 (배포 시 — 지금은 미실행)

```bash
# 1) CLI 설치 (1회)
npm install -g apify-cli

# 2) 로그인 (토큰은 .secrets에서 — 하드코딩 X)
apify login            # 또는 CI: apify login --token <APIFY_TOKEN>

# 3) 업스트림 API 키를 Apify secret으로 등록 (actor.json의 @SAJU_API_KEY가 참조)
apify secrets add SAJU_API_KEY sajuapi_free_xxx

# 4) (선택) 로컬 standby 실행 테스트
#    APIFY_META_ORIGIN=STANDBY APIFY_CONTAINER_PORT=8080 apify run
#    → http://localhost:8080/mcp 에 MCP 클라이언트 연결

# 5) 푸시 (.actor/actor.json 설정대로 빌드·업로드. publish 아님)
cd D:\kunstudio-apps\saju-mcp
apify push
```

푸시 후 Standby URL: `https://<username>--saju-mcp.apify.actor/mcp`
(MCP 클라이언트는 `Authorization: Bearer <APIFY_TOKEN>` 헤더로 연결).

## 게이트 (본사 자율 vs 사장님)

- 🟢 본사: 코드/파일 제작(완료), `apify secrets add`, `apify run` 로컬테스트.
- 🔴 사장님(또는 명시 승인 필요):
  - `apify push` (실배포) — 가격·과금 관련이라 게이트.
  - Apify Console에서 Monetization 활성화 + PPE 가격($0.01) 최종 확정.
  - Store **publish** (공개 상장).
  - payout = PayPal(한국 OK, 가입 완료됨).

## 자가검증 체크

- [x] `actor.json` 유효 (actorSpecification 1, standby, webServerMcpPath, input schema) — 공식 스키마 형식 일치.
- [x] 시크릿/토큰 하드코딩 0 (`SAJU_API_KEY`/`APIFY_TOKEN` 전부 env/secret 참조).
- [x] 기존 stdio MCP(`src/index.ts`) 무변경 — npm 무료 경로 보존.
- [x] PPE 이벤트 정의 + `Actor.charge()` 4개 tool 전부 연결.
- [x] `tsc --noEmit` exit 0, `npm run build` → index.js + actor.js 둘 다 emit.
- [x] 거짓 기능 0 (4개 tool = 기존 업스트림 엔드포인트 그대로 래핑).
- [x] `apify push` 절차 명시.

## 참고 출처 (cite)

- actor.json 형식: docs.apify.com/platform/actors/development/actor-definition/actor-json
- MCP standby/webServerMcpPath/포트: blog.apify.com/build-and-deploy-mcp-servers-typescript +
  apify/actor-templates `ts-mcp-empty` (실측 raw)
- PPE: docs.apify.com/platform/actors/publishing/monetize/pay-per-event +
  pay_per_event.json 형식 = ts-mcp-empty 템플릿 실측
- secret @접두: docs.apify.com/platform/.../environment-variables
- apify push: docs.apify.com/cli
