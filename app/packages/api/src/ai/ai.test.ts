import { randomUUID } from "node:crypto";
import { migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, type AppOptions } from "../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-KI-07: connect the AI client and manage access (real PostgreSQL, `make db-up`).
let pool: Pool;
let admin: Pool;
const subA = `ki-${randomUUID()}`;
const subB = `ki-${randomUUID()}`;
const RESOURCE = "https://pflanzendex.example/mcp";
const CLIENT = "https://claude.ai/oauth/mcp-oauth-client-metadata";
// Web tokens: `valid:<sub>`. AI tokens: `ai:<sub>:<client>:<scope with + for space>`.
const reviewer: TokenVerifier = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
const aiVerifier: TokenVerifier = async (token) => {
  const [kind, sub, client, scope] = token.split("|");
  return kind === "ai"
    ? {
        sub,
        email: `${sub}@example.test`,
        name: "Test",
        email_verified: true,
        azp: client,
        scope: scope?.replace(/\+/g, " "),
      }
    : null;
};
let app: ReturnType<typeof createApp>;
type Response = { status: number; body: Record<string, any>; headers: Headers }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function call(
  token: string | null,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "idempotency-key": randomUUID(),
  };
  if (token) headers["authorization"] = `Bearer ${token}`;
  const res = await app.request(path, {
    method,
    headers,
    ...(body === undefined || method === "GET" ? {} : { body: JSON.stringify(body) }),
  });
  return {
    status: res.status,
    body: (await res.json()) as Record<string, any>, // eslint-disable-line @typescript-eslint/no-explicit-any
    headers: res.headers,
  };
}
const web = (sub: string) => `valid:${sub}`;
const ai = (sub: string, scope: string, client = CLIENT) => `ai|${sub}|${client}|${scope}`;
const list = async (sub: string) =>
  (await call(web(sub), "GET", "/ai/connections")).body["connections"];

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp({
    reviewer,
    pool,
    ai: { verifier: aiVerifier, resource: RESOURCE, issuer: "https://login.example/realms/p" },
  });
  for (const sub of [subA, subB]) await call(web(sub), "GET", "/account");
});
afterAll(async () => {
  await admin.query("delete from account where subject = any($1)", [[subA, subB]]);
  await pool.end();
  await admin.end();
});

describe("US-KI-07 the AI interface announces its authorization server", () => {
  it("US-KI-07 serves the protected resource metadata (RFC 9728) with the sign-in service and our scopes", async () => {
    const r = await call(null, "GET", "/.well-known/oauth-protected-resource");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      resource: RESOURCE,
      authorization_servers: ["https://login.example/realms/p"],
      scopes_supported: ["pflanzen:read", "pflanzen:draft", "pflanzen:write"],
    });
  });

  it("US-KI-07 answers 401 with the metadata address for a missing token and for a token of the web app", async () => {
    for (const token of [null, web(subA), "garbage"]) {
      const r = await call(token, "GET", "/mcp/session");
      expect(r.status).toBe(401);
      expect(r.headers.get("www-authenticate")).toContain(
        'resource_metadata="https://pflanzendex.example/.well-known/oauth-protected-resource"',
      );
    }
  });

  it("US-KI-07 a token without one of our scopes is refused with the scope to request", async () => {
    const r = await call(ai(subA, "openid"), "GET", "/mcp/session");
    expect(r.status).toBe(403);
    expect(r.body["error"].code).toBe("ai.scope_insufficient");
    expect(r.headers.get("www-authenticate")).toContain('error="insufficient_scope"');
  });
});

describe("US-KI-07 connect and manage", () => {
  it("US-KI-07 the first call connects the client with 'create drafts', the list shows it, the request is visible", async () => {
    expect(await list(subA)).toEqual([]);
    const r = await call(ai(subA, "pflanzen:write"), "GET", "/mcp/session");
    expect(r.body).toMatchObject({ rights: "drafts" });
    const [row] = await list(subA);
    expect(row).toMatchObject({
      clientId: CLIENT,
      clientName: CLIENT,
      rights: "drafts",
      requestedRights: "write",
      revokedAt: null,
    });
    expect(row.lastUse).not.toBeNull();
  });

  it("US-KI-07 the keeper confirms the higher right; a stranger cannot see or change the connection (KI-R6)", async () => {
    const [row] = await list(subA);
    const foreign = await call(web(subB), "PUT", `/ai/connections/${row.id}/rights`, {
      rights: "write",
    });
    expect(foreign.status).toBe(404);
    expect(foreign.body["error"].code).toBe("ai.connection_not_found");
    expect(await list(subB)).toEqual([]);
    const own = await call(web(subA), "PUT", `/ai/connections/${row.id}/rights`, {
      rights: "write",
    });
    expect(own.status).toBe(200);
    expect((await call(ai(subA, "pflanzen:write"), "GET", "/mcp/session")).body["rights"]).toBe(
      "write",
    );
    expect(
      (await call(web(subA), "PUT", `/ai/connections/${row.id}/rights`, { rights: "root" })).status,
    ).toBe(400);
  });

  it("US-KI-07 a connection cannot manage connections: its token is not accepted on the keeper's routes (FR-KI-10)", async () => {
    const r = await call(ai(subA, "pflanzen:write"), "GET", "/ai/connections");
    expect(r.status).toBe(401);
  });

  it("US-KI-07 revoking takes effect at once, stays in the list, and only 'allow again' reconnects", async () => {
    const [row] = await list(subA);
    expect((await call(web(subB), "POST", `/ai/connections/${row.id}/revoke`)).status).toBe(404);
    expect((await call(web(subA), "POST", `/ai/connections/${row.id}/revoke`)).status).toBe(200);
    const denied = await call(ai(subA, "pflanzen:write"), "GET", "/mcp/session");
    expect(denied.status).toBe(401);
    expect(denied.body["error"].code).toBe("ai.connection_revoked");
    expect((await list(subA))[0].revokedAt).not.toBeNull();
    expect((await call(web(subA), "POST", `/ai/connections/${row.id}/allow-again`)).status).toBe(
      201,
    );
    expect((await call(ai(subA, "pflanzen:write"), "GET", "/mcp/session")).body["rights"]).toBe(
      "drafts",
    );
    expect(await list(subA)).toHaveLength(2);
  });

  it("US-KI-07 the same client of another account is a separate connection with its own rights", async () => {
    const r = await call(ai(subB, "pflanzen:read"), "GET", "/mcp/session");
    expect(r.body["rights"]).toBe("read");
    expect(await list(subB)).toHaveLength(1);
  });
});

describe("US-KI-02 daily status through the AI interface", () => {
  const status = (sub: string, scope = "pflanzen:read", zone = "Europe/Berlin") =>
    call(ai(sub, scope), "GET", `/mcp/status?timeZone=${zone}`);

  it("US-KI-02 needs a token of the AI audience, a right and a valid time zone", async () => {
    expect((await call(web(subA), "GET", "/mcp/status?timeZone=Europe/Berlin")).status).toBe(401);
    expect((await status(subA, "openid")).status).toBe(403);
    expect((await status(subA, "pflanzen:read", "Mars/Olympus")).status).toBe(400);
  });

  it("US-KI-02 answers the same list as Today for the connected account and nothing of other accounts", async () => {
    const own = await call(web(subA), "GET", "/today?timeZone=Europe/Berlin");
    const viaAi = await status(subA);
    expect(viaAi.status).toBe(200);
    expect(viaAi.body["items"]).toEqual(own.body["items"]);
    expect(viaAi.body["date"]).toBe(own.body["date"]);
    expect(viaAi.body["dataFields"]).toContain("items[].text");
    const other = await status(subB);
    expect(other.body["items"]).toEqual(
      (await call(web(subB), "GET", "/today?timeZone=Europe/Berlin")).body["items"],
    );
  });

  it("US-KI-02 every successful call shows in the keeper's log, not in anybody else's", async () => {
    const before = (await call(web(subB), "GET", "/ai/log")).body["log"].length;
    await status(subB);
    const mine = (await call(web(subB), "GET", "/ai/log")).body["log"];
    expect(mine).toHaveLength(before + 1);
    expect(mine[0]).toMatchObject({ operation: "status", clientName: CLIENT });
    const logA = (await call(web(subA), "GET", "/ai/log")).body["log"];
    expect(logA.every((e: { id: string }) => e.id !== mine[0].id)).toBe(true);
    expect((await call(ai(subB, "pflanzen:read"), "GET", "/ai/log")).status).toBe(401);
  });

  it("US-KI-02 a revoked connection gets no status any more", async () => {
    const list = (await call(web(subB), "GET", "/ai/connections")).body["connections"];
    await call(web(subB), "POST", `/ai/connections/${list[0].id}/revoke`);
    expect((await status(subB)).body["error"].code).toBe("ai.connection_revoked");
  });
});
