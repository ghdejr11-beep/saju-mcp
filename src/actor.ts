/**
 * Saju MCP Server — Apify Actor entrypoint (Streamable HTTP transport).
 * -------------------------------------------------------------------
 * This is the *cloud / Apify Store* entrypoint. It exposes the SAME four
 * Saju tools as the stdio server (src/index.ts) but over Streamable HTTP,
 * wired into Apify's Standby web server, and charges per tool call using
 * pay-per-event (PPE) billing.
 *
 * The original stdio MCP server (src/index.ts) is left completely untouched
 * so the free npm / Claude Desktop path keeps working. This file is only
 * used inside an Apify Actor container.
 *
 * Pattern is taken verbatim from Apify's official TypeScript MCP template
 * (apify/actor-templates → templates/ts-mcp-empty/src/main.ts):
 *   - Standby mode, web server listens on process.env.APIFY_CONTAINER_PORT
 *   - Stateless Streamable HTTP transport (new server per POST /mcp)
 *   - webServerMcpPath "/mcp" (see .actor/actor.json)
 *   - Readiness probe on GET / with the x-apify-container-server-readiness-probe header
 *   - Actor.charge({ eventName }) per tool call (events in .actor/pay_per_event.json)
 *
 * Auth to the upstream Saju API still comes from the SAJU_API_KEY env var,
 * never hardcoded. On Apify it is set as an Actor environment variable / secret.
 */

import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { Actor, log } from 'apify';

// ---------------------------------------------------------------------------
// Apify init (configures the Actor for its environment; must run at startup).
// ---------------------------------------------------------------------------
await Actor.init();

// ---------------------------------------------------------------------------
// Configuration (identical semantics to src/index.ts).
// ---------------------------------------------------------------------------

const API_BASE = process.env.SAJU_API_BASE ?? 'https://saju-api.pages.dev';
const API_KEY = process.env.SAJU_API_KEY ?? '';

// Single PPE event: charged once per successful tool call (price in
// .actor/pay_per_event.json — the file is the source of truth, finalized
// in the Apify Console Monetization step before publishing).
const CHARGE_EVENT = 'tool-call';

const SUPPORTED_LANGS = [
    'ko', 'en', 'ja', 'zh', 'es', 'pt-br', 'vi', 'id', 'hi', 'th',
] as const;

if (!API_KEY) {
    log.warning(
        '[saju-mcp] SAJU_API_KEY is not set. Every tool call will return 401 ' +
        'invalid_api_key until you set it as an Actor environment variable. ' +
        'Get a free key (100 req/day, no card) at ' +
        'POST https://saju-api.pages.dev/api/v1/keys/create',
    );
}

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

function toToolResponse(result: ApiResult): CallToolResult {
    if (!result.ok) {
        const errObj = result.body as Record<string, unknown>;
        const hint =
            result.status === 401
                ? ' (set the SAJU_API_KEY Actor environment variable to a valid key — get a free one at POST /api/v1/keys/create)'
                : result.status === 429
                    ? ' (daily quota for your tier exceeded)'
                    : '';
        return {
            isError: true,
            content: [
                {
                    type: 'text',
                    text: `Saju API error ${result.status}: ${JSON.stringify(errObj)}${hint}`,
                },
            ],
        };
    }

    return {
        content: [
            { type: 'text', text: JSON.stringify(result.body, null, 2) },
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

const birthShape = {
    year: z.number().int().min(1920).max(2050)
        .describe('Solar (Gregorian) birth year, 1920–2050'),
    month: z.number().int().min(1).max(12).describe('Birth month, 1–12'),
    day: z.number().int().min(1).max(31).describe('Birth day, 1–31'),
    hour: z.number().int().min(-1).max(23)
        .describe('Birth hour in 24h time (0–23). Use -1 if the hour is unknown.'),
    gender: z.enum(['M', 'F'])
        .describe("Gender: 'M' or 'F' (affects Daeun / luck-pillar direction)."),
};

const personSchema = z.object({
    ...birthShape,
    lang: langField,
});

// ---------------------------------------------------------------------------
// Build a fresh McpServer with the four Saju tools registered.
// A new instance is created per request (stateless Streamable HTTP).
// ---------------------------------------------------------------------------

function getServer(): McpServer {
    const server = new McpServer(
        { name: 'saju-mcp', version: '0.1.0' },
        { capabilities: { logging: {} } },
    );

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
            inputSchema: { ...birthShape, lang: langField },
        },
        async (args): Promise<CallToolResult> => {
            await Actor.charge({ eventName: CHARGE_EVENT });
            const result = await callApi('/api/v1/calculate', { method: 'POST', body: args });
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
            inputSchema: { ...birthShape, lang: langField },
        },
        async (args): Promise<CallToolResult> => {
            await Actor.charge({ eventName: CHARGE_EVENT });
            const result = await callApi('/api/v1/interpret', { method: 'POST', body: args });
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
                "plus each person's Day Master and zodiac.",
            inputSchema: {
                person_a: personSchema.describe('First person (birth details).'),
                person_b: personSchema.describe('Second person (birth details).'),
                lang: langField,
            },
        },
        async (args): Promise<CallToolResult> => {
            await Actor.charge({ eventName: CHARGE_EVENT });
            const result = await callApi('/api/v1/compatibility', { method: 'POST', body: args });
            return toToolResponse(result);
        },
    );

    // 4) saju_daily — GET /api/v1/daily
    server.registerTool(
        'saju_daily',
        {
            title: 'Daily Fortune Snapshot',
            description:
                'Daily fortune snapshot (0–100 score + advice) for a given Day Master ' +
                'and date. Provide the Day Master either as a Korean stem character ' +
                '(갑, 을, 병, 정, 무, 기, 경, 신, 임, 계) or an English alias ' +
                '(e.g. wood_yang, water_yin). The Day Master comes from a prior ' +
                'saju_calculate / saju_interpret call (day_master.stem).',
            inputSchema: {
                day_master: z.string().min(1).describe(
                    'Day Master: Korean stem (갑..계) or English alias ' +
                    '(wood_yang, wood_yin, fire_yang, ... water_yin).',
                ),
                date: z.string()
                    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')
                    .optional()
                    .describe('Target date in YYYY-MM-DD. Defaults to today (UTC).'),
                lang: langField,
            },
        },
        async (args): Promise<CallToolResult> => {
            await Actor.charge({ eventName: CHARGE_EVENT });
            const params = new URLSearchParams();
            params.set('day_master', args.day_master);
            if (args.date) params.set('date', args.date);
            if (args.lang) params.set('lang', args.lang);
            const result = await callApi(`/api/v1/daily?${params.toString()}`, { method: 'GET' });
            return toToolResponse(result);
        },
    );

    return server;
}

// ---------------------------------------------------------------------------
// Express app wired into the Apify Standby web server.
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());
app.use(
    cors({
        origin: '*',
        exposedHeaders: ['Mcp-Session-Id'],
    }),
);

// Readiness probe (Apify Standby health check).
app.get('/', (req: Request, res: Response) => {
    if (req.headers['x-apify-container-server-readiness-probe']) {
        log.info('Readiness probe');
        res.end('ok\n');
        return;
    }
    res.status(404).end();
});

// MCP Streamable HTTP endpoint (matches webServerMcpPath in actor.json).
app.post('/mcp', async (req: Request, res: Response) => {
    const server = getServer();
    try {
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
        });
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        res.on('close', () => {
            transport.close();
            server.close();
        });
    } catch (error) {
        log.error('Error handling MCP request', { error });
        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: '2.0',
                error: { code: -32603, message: 'Internal server error' },
                id: null,
            });
        }
    }
});

app.get('/mcp', (_req: Request, res: Response) => {
    res.writeHead(405).end(
        JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Method not allowed.' },
            id: null,
        }),
    );
});

app.delete('/mcp', (_req: Request, res: Response) => {
    res.writeHead(405).end(
        JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Method not allowed.' },
            id: null,
        }),
    );
});

const PORT = process.env.APIFY_CONTAINER_PORT
    ? parseInt(process.env.APIFY_CONTAINER_PORT, 10)
    : 3000;

app.listen(PORT, (error?: Error) => {
    if (error) {
        log.error('Failed to start server', { error });
        process.exit(1);
    }
    log.info(`Saju MCP Server (Apify) listening on port ${PORT} at path /mcp`);
});

process.on('SIGINT', () => {
    log.info('Shutting down Saju MCP Actor...');
    process.exit(0);
});
