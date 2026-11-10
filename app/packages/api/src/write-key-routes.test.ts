import { randomUUID } from "node:crypto";
import { appError, failed, InMemoryObjectStore } from "@pflanzendex/core";
import { createFileDatabase, migrate, openPool } from "@pflanzendex/db";
import type { Hono } from "hono";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, type AppOptions } from "./app";

// US-QS-03: every write route refuses a request without `Idempotency-Key`, before anything else is checked (the engine
// checks the key first, `execute` in core). This walks every non-GET route the app registers and sends it a key-less
// request with an empty body: each one must answer 400 `idempotency.key_missing`. A new write route that skips the key
// fails with its method and path. The app runs as in production: the media store and the wish image sources are set,
// so their 502 answers (which come before any write) do not hide the key check. It runs in a database of its own.

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

/**
 * Non-GET routes the walk does not send a key-less request to, each with its reason. A route is listed only when it
 * writes nothing or cannot carry the key. Every entry must still be a route of the app (checked below).
 */
const EXCEPTIONS: Record<string, string> = {
  "POST /registration/invitation":
    "no account yet, so there is no repeat guard: the subject registers with an invitation code (account/registration-routes.ts)",
  "POST /mcp":
    "JSON-RPC transport: each tool forwards its own idempotencyKey to the route that checks it (ai/mcp/tools)",
  "PUT /mcp": "answers 405 and writes nothing (ai/mcp/mcp-routes.ts)",
  "PATCH /mcp": "answers 405 and writes nothing (ai/mcp/mcp-routes.ts)",
  "DELETE /mcp": "answers 405 and writes nothing (ai/mcp/mcp-routes.ts)",
  "POST /specimens/import/preview":
    "a read whose file travels in the body: it answers every row and writes nothing, the write is POST /specimens/import with the key (collection/bulk/import-routes.ts, US-BES-18; import.test.ts checks that nothing is written)",
};

const KEY_MISSING = "idempotency.key_missing";
const RESOURCE = "https://pflanzendex.example/mcp";
const SUB = `wk-${randomUUID()}`;
// The keeper's web token, and the token of the keeper's AI client (its right starts at "drafts", the lower of both).
const keeper = `valid:${SUB}`;
const client = `ai|${SUB}|https://claude.ai/oauth/mcp-oauth-client-metadata|pflanzen:write`;
// The external sources of a wish image and a processor: the walk never gets past the key check to use them.
const unreachable = { get: async () => failed(appError("source.unavailable")) } as never;

const reviewer: TokenVerifier = async (token) =>
  token.startsWith("valid:")
    ? { sub: token.slice(6), email: `${SUB}@example.test`, name: "T", email_verified: true }
    : null;
const aiVerifier: TokenVerifier = async (token) => {
  const [kind, sub, azp, scope] = token.split("|");
  return kind === "ai"
    ? {
        sub,
        email: `${SUB}@example.test`,
        name: "T",
        email_verified: true,
        azp,
        scope: scope?.replace(/\+/g, " "),
      }
    : null;
};

let database: Awaited<ReturnType<typeof createFileDatabase>> | undefined;
let pool: Pool;
let app: Hono;
let routes: string[] = [];

/** `METHOD /path` of every non-GET route, once each; middleware (`ALL`) and the read methods are no routes to walk. */
function writeRoutesOf(hono: Hono): string[] {
  const rows = hono.routes.filter((r) => !["ALL", "GET", "HEAD", "OPTIONS"].includes(r.method));
  return [...new Set(rows.map((r) => `${r.method} ${r.path}`))].sort();
}

/** The answer's status and stable error code, `undefined` when the body carries none (a plain-text 405, for one). */
async function answerOf(res: Response): Promise<{ status: number; code: string | undefined }> {
  const text = await res.text();
  let code: unknown;
  try {
    code = (JSON.parse(text) as { error?: { code?: unknown } } | null)?.error?.code;
  } catch {
    code = undefined;
  }
  return { status: res.status, code: typeof code === "string" ? code : undefined };
}

/** The route called without a key: random ids for its path params, an empty JSON body, the token it needs. */
async function answerWithoutKey(route: string) {
  const [method = "", template = ""] = route.split(" ");
  const path = template.replace(/:\w+/g, () => randomUUID());
  const token = path.startsWith("/mcp") ? client : keeper;
  const res = await app.request(path, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: "{}",
  });
  return answerOf(res);
}

beforeAll(async () => {
  database = await createFileDatabase("pflanzendex_wk");
  pool = openPool(database.ownerUrl);
  await migrate(pool);
  app = createApp({
    reviewer,
    pool,
    ai: { verifier: aiVerifier, resource: RESOURCE, issuer: "https://login.example/realms/p" },
    media: { store: new InMemoryObjectStore(), processor: {} as never },
    wishImage: { sources: unreachable, download: unreachable },
  });
  routes = writeRoutesOf(app);
  // The keeper's account exists before the walk (the sign-in guard creates it on first use).
  const account = await app.request("/account", { headers: { authorization: `Bearer ${keeper}` } });
  expect(account.status).toBe(200);
}, 120_000);

afterAll(async () => {
  await pool?.end();
  await database?.drop();
});

describe("US-QS-03 every write route requires the repeat-guard key", () => {
  it("US-QS-03 every non-GET route, apart from the named exceptions, answers 400 idempotency.key_missing without a key", async () => {
    const walked = routes.filter((r) => !(r in EXCEPTIONS));
    const failures: string[] = [];
    for (const route of walked) {
      const answer = await answerWithoutKey(route);
      if (answer.status !== 400 || answer.code !== KEY_MISSING)
        failures.push(`${route} answers ${answer.status} ${answer.code ?? "(no error code)"}`);
    }
    expect(
      failures,
      "these routes write without the key: require it before anything else (execute or a route check), or name the route in EXCEPTIONS with a reason that it writes nothing",
    ).toEqual([]);
  });

  it("US-QS-03 the walk covers the write routes of the AI client that carry the key", () => {
    expect(routes.filter((r) => !(r in EXCEPTIONS))).toEqual(
      expect.arrayContaining([
        "POST /mcp/drafts",
        "POST /mcp/discover/decisions",
        "POST /mcp/tasks/:id/claim",
        "POST /mcp/tasks/:id/decline",
        "POST /specimens",
        "POST /wishes",
      ]),
    );
  });

  it("US-QS-03 every named exception is still a route of the app, with a reason", () => {
    expect(Object.keys(EXCEPTIONS).filter((r) => !routes.includes(r))).toEqual([]);
    expect(Object.entries(EXCEPTIONS).filter(([, why]) => why.trim() === "")).toEqual([]);
  });
});
