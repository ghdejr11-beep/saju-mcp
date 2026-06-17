# Saju MCP Server

An [MCP](https://modelcontextprotocol.io) (Model Context Protocol) server that
wraps the **Saju API** — Korean Four Pillars of Destiny (사주팔자 / Bazi) — so
MCP-capable clients (Claude Desktop, Cursor, and other MCP hosts) can compute
and interpret Saju directly in a conversation.

Backed by the live API at **https://saju-api.pages.dev** (10 languages:
ko, en, ja, zh, es, pt-br, vi, id, hi, th).

## Tools

| Tool | Upstream endpoint | What it does |
|------|-------------------|--------------|
| `saju_calculate` | `POST /api/v1/calculate` | Four Pillars (stem+branch+hanja), five-element distribution, Day Master, zodiac, from a solar birthdate. |
| `saju_interpret` | `POST /api/v1/interpret` | Full reading: Ten Gods (십신), hidden stems, Yongshin (용신), Daeun (대운), localized summaries. |
| `saju_compatibility` | `POST /api/v1/compatibility` | Two-person 궁합 score (0–100) with breakdown (element balance, Day Master relation, branch harmony/clash). |
| `saju_daily` | `GET /api/v1/daily` | Daily fortune snapshot (score + advice) for a Day Master and date. |

## Prerequisites

- Node.js **18+** (uses the built-in global `fetch`).
- A **Saju API key**. The free tier is **100 requests/day, no credit card**.

### Get a free API key

```bash
curl -X POST https://saju-api.pages.dev/api/v1/keys/create \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com"}'
```

The response contains an `api_key` of the form `sajuapi_free_...`. Keep it
secret — it is passed to the server via the `SAJU_API_KEY` environment variable,
never hardcoded.

## Install & build

```bash
npm install
npm run build      # compiles src/index.ts -> dist/index.js
```

Quick local check (lists the 4 tools, then exits):

```bash
SAJU_API_KEY="sajuapi_free_xxx" npm start
```

## Register in Claude Desktop

Edit your `claude_desktop_config.json`:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Add (use the **absolute path** to the built `dist/index.js`):

```json
{
  "mcpServers": {
    "saju": {
      "command": "node",
      "args": ["D:\\kunstudio-apps\\saju-mcp\\dist\\index.js"],
      "env": {
        "SAJU_API_KEY": "sajuapi_free_your_key_here"
      }
    }
  }
}
```

Restart Claude Desktop. The four `saju_*` tools appear in the tools menu.

> Other MCP hosts (Cursor, Windsurf, custom clients) use the same shape:
> `command: "node"`, `args: ["<abs path>/dist/index.js"]`, and a
> `SAJU_API_KEY` env var.

## Environment variables

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `SAJU_API_KEY` | yes (for real calls) | _(empty)_ | Your `sajuapi_*` key, sent as the `X-API-Key` header. Without it, every call returns `401 invalid_api_key`. |
| `SAJU_API_BASE` | no | `https://saju-api.pages.dev` | Override the upstream base URL (e.g. for a staging deploy). |

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

## License

Proprietary — KunStudio. Wraps the Saju API; subject to that API's terms.
