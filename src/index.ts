#!/usr/bin/env node
/**
 * Saju MCP Server
 * ---------------
 * Exposes the live Saju API (https://saju-api.pages.dev) as Model Context
 * Protocol tools over stdio, so MCP-capable clients (Claude Desktop, Cursor,
 * etc.) can compute Korean Four Pillars (Saju / Bazi), daily fortune,
 * compatibility, and full interpretation.
 *
 * SDK: @modelcontextprotocol/sdk v1.x (registerTool + StdioServerTransport).
 *      inputSchema is a Zod RawShape (object of validators) per v1.x docs:
 *      https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/docs/server.md
 *
 * Auth: the upstream API requires an `X-API-Key` header. We read it from the
 *       SAJU_API_KEY environment variable. NEVER hardcode a key here.
 *       Get a free key (100 req/day, no card) at POST /api/v1/keys/create.
 *
 * Endpoint specs are taken verbatim from the live backend:
 *   D:\saju-api\public\docs\openapi.yaml  and  D:\saju-api\functions\api\v1\*.js
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const API_BASE = process.env.SAJU_API_BASE ?? 'https://saju-api.pages.dev';
const API_KEY = process.env.SAJU_API_KEY ?? '';

const SUPPORTED_LANGS = [
  'ko', 'en', 'ja', 'zh', 'es', 'pt-br', 'vi', 'id', 'hi', 'th',
] as const;

// ---------------------------------------------------------------------------
// HTTP helper — calls the upstream Saju API with the X-API-Key header.
// ---------------------------------------------------------------------------

interface ApiResult {
  ok: boolean;
  status: number;
  body: unknown;
}

async function callApi(
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown } = { method: 'GET' },
): Promise<ApiResult> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    // Header name MUST be X-API-Key (see openapi.yaml securitySchemes).
    'X-API-Key': API_KEY,
  };

  const res = await fetch(`${API_BASE}${path}`, {
    method: init.method,
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  let body: unknown;
  const text = await res.text();
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { error: 'non_json_response', raw: text.slice(0, 500) };
  }

  return { ok: res.ok, status: res.status, body };
}

/** Format an ApiResult as an MCP tool response (text + structured content). */
function toToolResponse(result: ApiResult) {
  if (!result.ok) {
    const errObj = result.body as Record<string, unknown>;
    const hint =
      result.status === 401
        ? ' (set the SAJU_API_KEY environment variable to a valid key — get a free one at POST /api/v1/keys/create)'
        : result.status === 429
          ? ' (daily quota for your tier exceeded)'
          : '';
    return {
      isError: true,
      content: [
        {
          type: 'text' as const,
          text:
            `Saju API error ${result.status}: ` +
            `${JSON.stringify(errObj)}${hint}`,
        },
      ],
    };
  }

  return {
    content: [
      { type: 'text' as const, text: JSON.stringify(result.body, null, 2) },
    ],
    structuredContent: result.body as Record<string, unknown>,
  };
}

// ---------------------------------------------------------------------------
// Shared Zod shapes (mirrors openapi.yaml BirthRequest exactly).
// ---------------------------------------------------------------------------

const langField = z
  .enum(SUPPORTED_LANGS)
  .optional()
  .describe('Output language (default ko). One of: ' + SUPPORTED_LANGS.join(', '));

// BirthRequest fields, matching the API validators in functions/api/v1/*.js.
const birthShape = {
  year: z
    .number()
    .int()
    .min(1920)
    .max(2050)
    .describe('Solar (Gregorian) birth year, 1920–2050'),
  month: z.number().int().min(1).max(12).describe('Birth month, 1–12'),
  day: z.number().int().min(1).max(31).describe('Birth day, 1–31'),
  hour: z
    .number()
    .int()
    .min(-1)
    .max(23)
    .describe('Birth hour in 24h time (0–23). Use -1 if the hour is unknown.'),
  gender: z
    .enum(['M', 'F'])
    .describe("Gender: 'M' or 'F' (affects Daeun / luck-pillar direction)."),
};

// A nested person object (used by compatibility), built from the same shape.
const personSchema = z.object({
  ...birthShape,
  lang: langField,
});

// ---------------------------------------------------------------------------
// Server + tools
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'saju-mcp',
  version: '0.1.0',
});

// 1) saju_calculate — POST /api/v1/calculate
server.registerTool(
  'saju_calculate',
  {
    title: 'Calculate Saju (Four Pillars)',
    description:
      'Compute the Korean Four Pillars of Destiny (사주팔자 / Bazi) from a ' +
      'solar birthdate. Returns the year/month/day/hour pillars (heavenly ' +
      'stem + earthly branch, with hanja), the five-element distribution ' +
      '(wood/fire/earth/metal/water), the Day Master, and the zodiac animal.',
    inputSchema: {
      ...birthShape,
      lang: langField,
    },
  },
  async (args) => {
    const result = await callApi('/api/v1/calculate', {
      method: 'POST',
      body: args,
    });
    return toToolResponse(result);
  },
);

// 2) saju_interpret — POST /api/v1/interpret
server.registerTool(
  'saju_interpret',
  {
    title: 'Interpret Saju (Ten Gods, Yongshin, Daeun)',
    description:
      'Full Saju interpretation from a solar birthdate: the Four Pillars plus ' +
      'Ten Gods (십신), hidden stems, life stages, interactions, Yongshin ' +
      '(용신 / useful god), Daeun (대운 / luck pillars), and human-readable ' +
      'summaries in the requested language.',
    inputSchema: {
      ...birthShape,
      lang: langField,
    },
  },
  async (args) => {
    const result = await callApi('/api/v1/interpret', {
      method: 'POST',
      body: args,
    });
    return toToolResponse(result);
  },
);

// 3) saju_compatibility — POST /api/v1/compatibility
server.registerTool(
  'saju_compatibility',
  {
    title: 'Saju Compatibility (궁합)',
    description:
      'Score two-person compatibility (궁합) from 0–100 based on both ' +
      "people's Saju. Returns the overall score and a breakdown " +
      '(element balance, Day Master relation, branch harmony, branch clash) ' +
      'plus each person\'s Day Master and zodiac.',
    inputSchema: {
      person_a: personSchema.describe('First person (birth details).'),
      person_b: personSchema.describe('Second person (birth details).'),
      lang: langField,
    },
  },
  async (args) => {
    const result = await callApi('/api/v1/compatibility', {
      method: 'POST',
      body: args,
    });
    return toToolResponse(result);
  },
);

// 4) saju_daily — GET /api/v1/daily
server.registerTool(
  'saju_daily',
  {
    title: "Daily Fortune Snapshot",
    description:
      'Daily fortune snapshot (0–100 score + advice) for a given Day Master ' +
      'and date. Provide the Day Master either as a Korean stem character ' +
      '(갑, 을, 병, 정, 무, 기, 경, 신, 임, 계) or an English alias ' +
      '(e.g. wood_yang, water_yin). The Day Master comes from a prior ' +
      'saju_calculate / saju_interpret call (day_master.stem).',
    inputSchema: {
      day_master: z
        .string()
        .min(1)
        .describe(
          'Day Master: Korean stem (갑..계) or English alias ' +
            '(wood_yang, wood_yin, fire_yang, ... water_yin).',
        ),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')
        .optional()
        .describe('Target date in YYYY-MM-DD. Defaults to today (UTC).'),
      lang: langField,
    },
  },
  async (args) => {
    const params = new URLSearchParams();
    params.set('day_master', args.day_master);
    if (args.date) params.set('date', args.date);
    if (args.lang) params.set('lang', args.lang);
    const result = await callApi(`/api/v1/daily?${params.toString()}`, {
      method: 'GET',
    });
    return toToolResponse(result);
  },
);

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function main() {
  if (!API_KEY) {
    // Warn on stderr (stdout is reserved for the JSON-RPC stream).
    process.stderr.write(
      '[saju-mcp] WARNING: SAJU_API_KEY is not set. Every tool call will ' +
        'return 401 invalid_api_key until you set it. Get a free key at ' +
        'POST https://saju-api.pages.dev/api/v1/keys/create\n',
    );
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('[saju-mcp] server connected over stdio\n');
}

main().catch((err) => {
  process.stderr.write(`[saju-mcp] fatal: ${String(err)}\n`);
  process.exit(1);
});
