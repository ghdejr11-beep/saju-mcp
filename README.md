# Saju MCP — Korean Four Pillars & BaZi Astrology

Service home: https://sajuapp.app


[![npm](https://img.shields.io/npm/v/saju-mcp)](https://www.npmjs.com/package/saju-mcp)
[![node](https://img.shields.io/node/v/saju-mcp)](https://www.npmjs.com/package/saju-mcp)
[![MCP Registry](https://img.shields.io/badge/MCP_Registry-listed-blue)](https://registry.modelcontextprotocol.io/v0/servers?search=saju-mcp)
[![license](https://img.shields.io/badge/license-proprietary-lightgrey)](#license)

An [MCP](https://modelcontextprotocol.io) (Model Context Protocol) server that
wraps the **Saju API** — Korean Four Pillars of Destiny (사주팔자 / BaZi / 八字) — so
any MCP-capable AI client (Claude Desktop, Cursor, VS Code, Windsurf, and custom
agents) can compute, interpret, and compare Korean Saju charts directly in a
conversation.

```bash
SAJU_API_KEY="sajuapi_free_xxx" npx saju-mcp
```

> **30-second path:** [get a free key](#1-get-a-free-api-key-no-card) → [add the config](#3-register-in-your-mcp-client) → ask your AI client *"calculate the saju for someone born 1990-05-15 14:00, male."*

---

## Why this MCP?

- The only production-grade **Korean** Saju engine available as an MCP server.
- **KASI-validated** lunar conversion (47,000+ days cross-checked, zero failures).
- **Ten Gods (十神) + Yongshin (用神) + Daeun (大運)** — interpretive features absent
  from generic Western astrology APIs that only return sun/moon signs.
- **10 output languages**: Korean, English, Japanese, Chinese, Spanish,
  Portuguese, Vietnamese, Indonesian, Hindi, Thai.
- **Free tier: 100 requests/day, no credit card.** Freemium — start building today
  and upgrade only when your app needs production volume.

Backed by the live API at **https://saju-api.pages.dev**.

## What it looks like in practice

Ask your AI client a natural-language question; it calls `saju_calculate` and gets
back structured data it can reason over. This is a **real, unedited** response from
the live API for `{ year: 1990, month: 5, day: 15, hour: 14, gender: "M", lang: "en" }`:

```json
{
  "pillars": {
    "year":  { "stem": "경", "branch": "오", "stem_hanja": "庚", "branch_hanja": "午" },
    "month": { "stem": "신", "branch": "사", "stem_hanja": "辛", "branch_hanja": "巳" },
    "day":   { "stem": "경", "branch": "진", "stem_hanja": "庚", "branch_hanja": "辰" },
    "hour":  { "stem": "계", "branch": "미", "stem_hanja": "癸", "branch_hanja": "未" }
  },
  "elements": { "wood": 0, "fire": 2, "earth": 2, "metal": 3, "water": 1 },
  "day_master": { "stem": "경", "element": "metal", "polarity": "yang" },
  "zodiac": "horse",
  "tier": "free",
  "remaining": 99
}
```

Every response is returned to the model as both human-readable text **and**
`structuredContent`, so agents can branch on `day_master.element`, `elements`, a
compatibility `score`, etc. without re-parsing prose.

## Tools

| Tool | Upstream endpoint | What it does |
|------|-------------------|--------------|
| `saju_calculate` | `POST /api/v1/calculate` | Four Pillars (stem+branch+hanja), five-element distribution, Day Master, zodiac, from a solar birthdate. |
| `saju_interpret` | `POST /api/v1/interpret` | Full reading: Ten Gods (십신), hidden stems, Yongshin (용신), Daeun (대운), localized summaries. |
| `saju_compatibility` | `POST /api/v1/compatibility` | Two-person 궁합 score (0–100) with breakdown (element balance, Day Master relation, branch harmony/clash). |
| `saju_daily` | `GET /api/v1/daily` | Daily fortune snapshot (score + advice) for a Day Master and date. |

---

## Quickstart

### 1. Get a free API key (no card)

The free tier is **100 requests/day, no credit card**:

```bash
curl -X POST https://saju-api.pages.dev/api/v1/keys/create \
  -H "Content-Type: application/json" \
  -d '{"email":"dev@yourcompany.com"}'
```

The response contains an `api_key` of the form `sajuapi_free_...`:

```json
{
  "api_key": "sajuapi_free_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "tier": "free",
  "daily_limit": 100,
  "rps": 1,
  "monthly_price_usd": 0,
  "note": "Store this key safely — it is shown only once. Send with header `X-API-Key: <key>`."
}
```

> The key is shown **only once** — store it now. It is passed to the server via the
> `SAJU_API_KEY` environment variable, never hardcoded. (Disposable / `example.com`
> email domains are rejected — use a real address.)

### 2. (Optional) Smoke-test without an MCP client

`npx` runs the server straight from npm — no clone, no local build:

```bash
SAJU_API_KEY="sajuapi_free_xxx" npx -y saju-mcp
```

It speaks MCP over stdio and exposes the four `saju_*` tools. Press `Ctrl-C` to exit.

### 3. Register in your MCP client

The server is **stdio-based**, so every MCP client uses the same three pieces:
`command: npx`, `args: ["-y", "saju-mcp"]`, and an `env` with your `SAJU_API_KEY`.

<details open>
<summary><strong>Claude Desktop</strong></summary>

Edit your config file, then restart Claude Desktop:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "saju": {
      "command": "npx",
      "args": ["-y", "saju-mcp"],
      "env": { "SAJU_API_KEY": "sajuapi_free_your_key_here" }
    }
  }
}
```
</details>

<details>
<summary><strong>Cursor</strong></summary>

Add to `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (per-project), then
reload:

```json
{
  "mcpServers": {
    "saju": {
      "command": "npx",
      "args": ["-y", "saju-mcp"],
      "env": { "SAJU_API_KEY": "sajuapi_free_your_key_here" }
    }
  }
}
```
</details>

<details>
<summary><strong>VS Code (GitHub Copilot / MCP)</strong></summary>

Add to `.vscode/mcp.json` in your workspace:

```json
{
  "servers": {
    "saju": {
      "command": "npx",
      "args": ["-y", "saju-mcp"],
      "env": { "SAJU_API_KEY": "sajuapi_free_your_key_here" }
    }
  }
}
```
</details>

<details>
<summary><strong>Windsurf</strong></summary>

Add to `~/.codeium/windsurf/mcp_config.json`, then refresh MCP servers:

```json
{
  "mcpServers": {
    "saju": {
      "command": "npx",
      "args": ["-y", "saju-mcp"],
      "env": { "SAJU_API_KEY": "sajuapi_free_your_key_here" }
    }
  }
}
```
</details>

Restart / reload your client. The four `saju_*` tools appear in its tool list.

---

## Example tool inputs

`saju_calculate` / `saju_interpret`:

```json
{ "year": 1990, "month": 5, "day": 15, "hour": 14, "gender": "M", "lang": "en" }
```

(`hour: -1` if the birth hour is unknown.)

`saju_compatibility`:

```json
{
  "person_a": { "year": 1990, "month": 5, "day": 15, "hour": 14, "gender": "M" },
  "person_b": { "year": 1992, "month": 8, "day": 3,  "hour": 9,  "gender": "F" },
  "lang": "en"
}
```

`saju_daily` (Day Master from a prior calculate/interpret call):

```json
{ "day_master": "갑", "date": "2026-06-17", "lang": "en" }
```

**Input bounds** (validated server-side, mirrors the API): `year` 1920–2050,
`month` 1–12, `day` 1–31, `hour` -1–23, `gender` `"M"`|`"F"`, `lang` one of the 10
supported codes (default `ko`).

## Environment variables

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `SAJU_API_KEY` | yes (for real calls) | _(empty)_ | Your `sajuapi_*` key, sent as the `X-API-Key` header. Without it, every call returns `401 invalid_api_key`. |
| `SAJU_API_BASE` | no | `https://saju-api.pages.dev` | Override the upstream base URL (e.g. a staging deploy). |

## Errors & troubleshooting

When an upstream call fails, the tool returns an MCP **error result** (`isError: true`)
whose text is `Saju API error <status>: <body>` plus a hint. Common cases:

| Symptom | HTTP status | Cause | Fix |
|---------|-------------|-------|-----|
| `401 invalid_api_key` | 401 | `SAJU_API_KEY` is missing, mistyped, or revoked. | Set the env var to a valid `sajuapi_*` key. [Get a free one.](#1-get-a-free-api-key-no-card) |
| `429` (daily quota exceeded) | 429 | Free tier is 100 req/day, 1 rps. | Wait for the daily reset, or upgrade to a paid tier for production volume. |
| `invalid_input` | 400 | A field is out of bounds (e.g. `month: 13`) or missing. | Check the input bounds above; the `reason` field names the offending field. |
| Tools don't appear in the client | — | Client not restarted, or `npx` can't fetch the package. | Restart the client; run `npx -y saju-mcp` once in a terminal to confirm it starts. |
| `non_json_response` | any | Upstream returned non-JSON (rare; network/proxy). | Retry; if persistent, check `SAJU_API_BASE` is correct. |

Keys never appear in tool output or logs. If a key leaks, mint a new one — the old
one keeps its own quota and can be abandoned.

## Develop / build from source

```bash
git clone https://github.com/ghdejr11-beep/saju-mcp.git
cd saju-mcp
npm install
npm run build      # compiles src/index.ts -> dist/index.js
npm run typecheck  # tsc --noEmit
```

Run the local build directly:

```json
{
  "mcpServers": {
    "saju": {
      "command": "node",
      "args": ["/absolute/path/to/saju-mcp/dist/index.js"],
      "env": { "SAJU_API_KEY": "sajuapi_free_your_key_here" }
    }
  }
}
```

Requires **Node.js 18+** (uses the built-in global `fetch`).

## Upgrading to production

The free tier (100 req/day, 1 rps) is for building and evaluation. When your app
ships, higher-volume tiers are available on the same API — see
**https://saju-api.pages.dev** for current plans and the key endpoint. Your code
and config don't change; only the key does.

## Related

- **Korea Calendar API** — Korean public holidays, lunar↔solar conversion, the
  gapja (간지) pillars and the 24 solar terms over REST. Pairs naturally with this
  server when you need the raw calendar facts behind a saju reading:
  https://korea-calendar-api.kunstudio.workers.dev

## License

Proprietary — KunStudio. Wraps the Saju API; subject to that API's terms.
