# Saju MCP Server — Build Report

**Date:** 2026-06-17
**Output dir:** `D:\kunstudio-apps\saju-mcp\` (D: drive per house rule — no C: artifacts)
**Status:** Code + docs complete. NOT deployed/registered (registry publish = 사장님 gate).

---

## 1. Live backend — measured, not assumed

| Check | Command | Result |
|-------|---------|--------|
| `/api/v1/daily` alive | `curl GET .../api/v1/daily` | `HTTP/1.1 401 {"error":"invalid_api_key"}` → function live, key-gated |
| `/api/v1/calculate` alive | `curl POST` no key | `401 {"error":"invalid_api_key"}` → live |
| `/api/v1/keys/create` alive | `curl POST {}` | `400` (validates email) → live, public (no key) |

CORS header from live server confirms auth header name: `Access-Control-Allow-Headers: Content-Type,X-API-Key,X-Tier-Token`.

**Auth (measured from `D:\saju-api\lib\auth.js` + handlers):** `X-API-Key` request header. Handler reads `req.headers['x-api-key']`. Key format `sajuapi_<free|dev|pro|enterprise>_<16+ alnum>`. Free tier = 100 req/day, no card. **No secret value read or printed.**

**Endpoint specs (read from `D:\saju-api\public\docs\openapi.yaml` + `functions/api/v1/*.js`):**

| MCP tool | Method + path | Request | Key response fields |
|----------|---------------|---------|---------------------|
| `saju_calculate` | POST `/api/v1/calculate` | `{year,month,day,hour,gender,lang?}` (BirthRequest) | pillars, elements, day_master, zodiac, tier, remaining |
| `saju_interpret` | POST `/api/v1/interpret` | BirthRequest | + ten_gods, yongshin, daeun, summary |
| `saju_compatibility` | POST `/api/v1/compatibility` | `{person_a:BirthRequest, person_b:BirthRequest, lang?}` | score(0–100), breakdown, person_a/b |
| `saju_daily` | GET `/api/v1/daily?day_master=&date=&lang=` | query params | date, day_pillar, score, advice_key/label |

BirthRequest validators (verbatim from handlers): `year` int 1920–2050, `month` 1–12, `day` 1–31, `hour` int −1..23 (−1 = unknown), `gender` `M`|`F`. Langs: ko,en,ja,zh,es,pt-br,vi,id,hi,th.

## 2. MCP SDK — version cited

- Package: **`@modelcontextprotocol/sdk`**, stable **v1.29.0** (resolved & locked in this build). v2 (`@modelcontextprotocol/server`) is anticipated Q3 2026 and NOT yet stable — so v1.x used. Source: [npm @modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk), [typescript-sdk releases](https://github.com/modelcontextprotocol/typescript-sdk/releases).
- Pattern (v1.x): `new McpServer({name,version})`, `server.registerTool(name, {title,description,inputSchema}, cb)` where **`inputSchema` is a Zod raw shape** (object of validators, NOT wrapped in `z.object()`), then `StdioServerTransport` + `await server.connect(transport)`. Imports: `@modelcontextprotocol/sdk/server/mcp.js`, `@modelcontextprotocol/sdk/server/stdio.js`. Source: [v1.x server docs](https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/docs/server.md).

## 3. Tools exposed (4)

`saju_calculate`, `saju_interpret`, `saju_compatibility`, `saju_daily` — each with description + JSON-Schema-able Zod inputSchema matching the openapi.yaml request format, calling the live API via `fetch` with `X-API-Key` from `process.env.SAJU_API_KEY`.

## 4. Self-verification (all PASS)

- **Secrets = 0**: grep for `sajuapi_*` keys / Bearer tokens / Upstash tokens in `src/`, `README.md`, `package.json` → `NO_HARDCODED_SECRETS`. API key sourced only from `process.env.SAJU_API_KEY` (line 31), sent only as `X-API-Key` header (line 54).
- **inputSchema ↔ openapi.yaml match**: calculate/interpret props = `year,month,day,hour,gender,lang`; compatibility = `person_a,person_b,lang`; daily props = `day_master,date,lang`, required = `["day_master"]`. Verified by serializing the live `tools/list` JSON Schema.
- **Compiles**: `tsc --noEmit` → TYPECHECK_PASS. `tsc` build → `dist/index.js` emitted.
- **Runtime smoke test**: spawned `dist/index.js`, sent MCP `initialize` + `tools/list` over stdio → server connected, returned all 4 tools with correct schemas. No-key warning printed to **stderr** (stdout kept clean for JSON-RPC).

## 5. How 본사 verifies

```bash
cd D:\kunstudio-apps\saju-mcp
npm install && npm run build
# list tools (no real API call needed):
SAJU_API_KEY="" npm start    # prints connect + warning, ^C to exit
# real end-to-end (needs a free key):
curl -X POST https://saju-api.pages.dev/api/v1/keys/create -H "Content-Type: application/json" -d '{"email":"you@example.com"}'
# put returned key in SAJU_API_KEY, register in claude_desktop_config.json (see README)
```

## 6. 사장님 게이트 (NOT done by me)

1. **Get the free API key** (`POST /api/v1/keys/create`) and set `SAJU_API_KEY` — I do not mint or store keys.
2. **MCP registry / directory listing** (e.g. modelcontextprotocol registry, Smithery, Glama) — account-gated publish. Competitors "Saju from Seoul" / "Ziwei & Bazi" are listed there; this is the net-new channel, but registration needs 사장님 account + decision.
3. **npm publish** (if distributing as `npx saju-mcp`) — needs npm account/login.

## Files
- `src/index.ts` — MCP server (4 tools, stdio)
- `package.json`, `tsconfig.json`, `.gitignore`
- `dist/index.js` — compiled (build output)
- `README.md` — install + claude_desktop_config.json + usage
- `_REPORT.md` — this file
