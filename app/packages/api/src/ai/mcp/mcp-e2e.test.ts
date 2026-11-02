import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { serve, type ServerType } from "@hono/node-server";
import { migrate, openOwnerPool } from "@pflanzendex/db";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTokenVerifier } from "../../account";
import { createApp } from "../../app";

// End to end (FR-KI-06, US-KI-07): an MCP client's protocol flow against the running app over HTTP, with signed JWTs and
// the real token check (issuer, audience, signature). Only the sign-in service is replaced by a local key pair.
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const ISSUER = "https://login.example/realms/pflanzendex";
const RESOURCE = "https://pflanzendex.example/api/mcp";
const CLIENT = "https://claude.ai/oauth/mcp-oauth-client-metadata";
const sub = `e2e-mcp-${randomUUID()}`;
let pool: Pool;
let server: ServerType;
let base = "";
let sign: (audience: string, extra?: Json) => Promise<string>;

beforeAll(async () => {
  pool = openOwnerPool();
  await migrate(pool);
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const jwk = { ...(await exportJWK(publicKey)), alg: "ES256", kid: "k1" };
  const key = createLocalJWKSet({ keys: [jwk] });
  sign = (audience, extra = {}) =>
    new SignJWT({ email: `${sub}@example.test`, name: "E2E", email_verified: true, ...extra })
      .setProtectedHeader({ alg: "ES256", kid: "k1" })
      .setIssuer(ISSUER)
      .setSubject(sub)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
  const app = createApp({
    pool,
    version: "e2e",
    reviewer: createTokenVerifier({ issuer: ISSUER, audience: "pflanzendex-api", key }),
    ai: {
      resource: RESOURCE,
      issuer: ISSUER,
      verifier: createTokenVerifier({ issuer: ISSUER, audience: RESOURCE, key }),
    },
  });
  await new Promise<void>((resolve) => {
    server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" }, (info: AddressInfo) => {
      base = `http://127.0.0.1:${info.port}`;
      resolve();
    });
  });
  // The keeper signs in to the app once (the account exists before a client connects).
  await fetch(`${base}/account`, {
    headers: { authorization: `Bearer ${await sign("pflanzendex-api")}` },
  });
});
afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.query("delete from account where subject = $1", [sub]);
  await pool.end();
});

/** One POST to the MCP endpoint, as a Streamable HTTP client sends it. */
async function send(token: string | null, message: Json, headers: Record<string, string> = {}) {
  const res = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: JSON.stringify(message),
  });
  const text = await res.text();
  return { res, body: (text ? JSON.parse(text) : null) as Json | null };
}

describe("FR-KI-06 US-KI-07 an MCP client connects end to end", () => {
  it("US-KI-07 discovery: 401 names the metadata, which names the sign-in service and the resource", async () => {
    const { res } = await send(null, { jsonrpc: "2.0", id: 0, method: "initialize", params: {} });
    expect(res.status).toBe(401);
    const challenge = res.headers.get("www-authenticate") ?? "";
    const url = /resource_metadata="([^"]+)"/.exec(challenge)?.[1] ?? "";
    expect(url).toBe("https://pflanzendex.example/api/.well-known/oauth-protected-resource");
    // Behind the proxy `/api/x` reaches the API as `/x`.
    const meta = (await (
      await fetch(`${base}${new URL(url).pathname.replace(/^\/api/, "")}`)
    ).json()) as Json;
    expect(meta).toMatchObject({ resource: RESOURCE, authorization_servers: [ISSUER] });
  });

  it("US-KI-07 a token of the web app is refused at the endpoint (own audience)", async () => {
    const { res } = await send(
      await sign("pflanzendex-api", { azp: CLIENT, scope: "pflanzen:draft" }),
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
      },
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain('error="invalid_token"');
  });

  it("FR-KI-06 initialize → initialized → tools/list → tools/call with a token for the interface", async () => {
    const token = await sign(RESOURCE, { azp: CLIENT, scope: "openid pflanzen:draft" });
    const init = await send(token, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "e2e", version: "1" },
      },
    });
    expect(init.res.status).toBe(200);
    expect(init.res.headers.get("content-type")).toContain("application/json");
    expect(init.body?.["result"]).toMatchObject({
      protocolVersion: "2025-11-25",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "pflanzendex", version: "e2e" },
    });
    const version = { "mcp-protocol-version": "2025-11-25" };
    const initialized = await send(
      token,
      { jsonrpc: "2.0", method: "notifications/initialized" },
      version,
    );
    expect([initialized.res.status, initialized.body]).toEqual([202, null]);
    const list = await send(token, { jsonrpc: "2.0", id: 2, method: "tools/list" }, version);
    const names = (list.body?.["result"].tools as Json[]).map((t) => t["name"]);
    expect(names).toContain("get_status");
    const call = await send(
      token,
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "get_session", arguments: {} },
      },
      version,
    );
    expect(call.body).toMatchObject({
      jsonrpc: "2.0",
      id: 3,
      result: { isError: false, structuredContent: { client: CLIENT, rights: "drafts" } },
    });
    const status = await send(
      token,
      {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "get_status", arguments: { timeZone: "Europe/Berlin" } },
      },
      version,
    );
    expect(status.body?.["result"].isError).toBe(false);
  });

  it("FR-KI-06 a modern client (2026-07-28) calls a tool without a handshake", async () => {
    const token = await sign(RESOURCE, { azp: CLIENT, scope: "pflanzen:read" });
    const { res, body } = await send(
      token,
      {
        jsonrpc: "2.0",
        id: "m1",
        method: "tools/call",
        params: {
          name: "get_session",
          arguments: {},
          _meta: {
            "io.modelcontextprotocol/protocolVersion": "2026-07-28",
            "io.modelcontextprotocol/clientCapabilities": {},
          },
        },
      },
      {
        "mcp-protocol-version": "2026-07-28",
        "mcp-method": "tools/call",
        "mcp-name": "get_session",
      },
    );
    expect(res.status).toBe(200);
    expect(body?.["result"]).toMatchObject({ resultType: "complete", isError: false });
  });
});
