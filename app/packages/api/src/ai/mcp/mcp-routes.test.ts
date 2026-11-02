import { randomUUID } from "node:crypto";
import { InMemoryObjectStore, NO_FEATURES } from "@pflanzendex/core";
import { migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, type AppOptions } from "../../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// The MCP endpoint POST /mcp (E-04, US-KI-02, -04, -05, -07, -08, -09): JSON-RPC over the routes of the AI interface,
// with their guards (real PostgreSQL, `make db-up`).
let pool: Pool;
let admin: Pool;
const subA = `mcp-${randomUUID()}`;
const subB = `mcp-${randomUUID()}`;
const RESOURCE = "https://pflanzendex.example/api/mcp";
const METADATA = "https://pflanzendex.example/api/.well-known/oauth-protected-resource";
const CLIENT = "https://claude.ai/oauth/mcp-oauth-client-metadata";
const OTHER = "https://chatgpt.com/connector";
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
const photos = new InMemoryObjectStore();
const options = (features?: AppOptions["features"]): AppOptions => ({
  reviewer,
  pool,
  version: "1.2.3",
  ...(features ? { features } : {}),
  media: { store: photos, processor: {} as never /* the photo is only read here */ },
  ai: { verifier: aiVerifier, resource: RESOURCE, issuer: "https://login.example/realms/p" },
});
let app: ReturnType<typeof createApp>;
const web = (sub: string) => `valid:${sub}`;
const ai = (sub: string, scope: string, client = CLIENT) => `ai|${sub}|${client}|${scope}`;

async function rest(token: string, method: string, path: string, body?: unknown) {
  const res = await app.request(path, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "idempotency-key": randomUUID(),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as Json };
}

let nextId = 1;
const parse = (text: string): Json => {
  try {
    return JSON.parse(text) as Json;
  } catch {
    return {};
  }
};
async function post(token: string | null, message: unknown, headers: Record<string, string> = {}) {
  const res = await app.request("/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: typeof message === "string" ? message : JSON.stringify(message),
  });
  const text = await res.text();
  return {
    status: res.status,
    headers: res.headers,
    text,
    body: parse(text),
  };
}
const rpc = (token: string | null, method: string, params?: Json) =>
  post(token, { jsonrpc: "2.0", id: nextId++, method, ...(params ? { params } : {}) });
const tool = async (token: string, name: string, args: Json = {}) => {
  const r = await rpc(token, "tools/call", { name, arguments: args });
  return { ...r, result: r.body["result"] as Json };
};

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp(options());
  for (const sub of [subA, subB]) await rest(web(sub), "GET", "/account");
  // The first call connects the client with the default right "create drafts" (US-KI-07).
  await rest(ai(subA, "pflanzen:draft"), "GET", "/mcp/session");
});
afterAll(async () => {
  const subs = [[subA, subB]];
  await admin.query(
    "delete from specimen where account_id in (select id from account where subject = any($1))",
    subs,
  );
  await admin.query("delete from account where subject = any($1)", subs);
  await pool.end();
  await admin.end();
});

describe("US-KI-07 the endpoint and its access", () => {
  it("US-KI-07 GET and DELETE answer 405 with Allow: POST", async () => {
    for (const method of ["GET", "DELETE"]) {
      const res = await app.request("/mcp", { method });
      expect([res.status, res.headers.get("allow")]).toEqual([405, "POST"]);
    }
  });

  it("US-KI-07 without a token 401 names the resource metadata, a web token is an invalid token", async () => {
    const none = await rpc(null, "initialize", { protocolVersion: "2025-11-25" });
    expect(none.status).toBe(401);
    expect(none.headers.get("www-authenticate")).toBe(`Bearer resource_metadata="${METADATA}"`);
    for (const token of [web(subA), "garbage"]) {
      const r = await rpc(token, "tools/list");
      expect(r.status).toBe(401);
      expect(r.headers.get("www-authenticate")).toContain('error="invalid_token"');
    }
  });

  it("US-KI-07 the metadata is served at the address the challenge names and at the RFC 9728 path", async () => {
    for (const path of [
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-protected-resource/api/mcp",
    ]) {
      const res = await app.request(path);
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        resource: RESOURCE,
        scopes_supported: ["pflanzen:read", "pflanzen:draft", "pflanzen:write"],
      });
    }
  });

  it("US-KI-07 a foreign Origin is refused (DNS rebinding), the own origin and none pass", async () => {
    const body = { jsonrpc: "2.0", id: 1, method: "ping" };
    const evil = await post(ai(subA, "pflanzen:read"), body, { origin: "https://evil.example" });
    expect(evil.status).toBe(403);
    const own = await post(ai(subA, "pflanzen:read"), body, {
      origin: "https://pflanzendex.example",
    });
    expect(own.status).toBe(200);
  });

  it("US-KI-07 wrong media types and broken JSON are refused before anything runs", async () => {
    expect(
      (await post(ai(subA, "pflanzen:read"), "{}", { "content-type": "text/plain" })).status,
    ).toBe(415);
    expect((await post(ai(subA, "pflanzen:read"), "{", {})).body["error"].code).toBe(-32700);
    const batch = await post(ai(subA, "pflanzen:read"), [
      { jsonrpc: "2.0", id: 1, method: "ping" },
    ]);
    expect([batch.status, batch.body["error"].code]).toEqual([400, -32600]);
  });

  it("US-DEV-06 while the switch 'ai' is off the endpoint answers 404", async () => {
    const before = app;
    app = createApp(options(NO_FEATURES));
    try {
      expect((await rpc(ai(subA, "pflanzen:read"), "tools/list")).status).toBe(404);
    } finally {
      app = before;
    }
  });
});

describe("US-KI-07 FR-KI-06 the protocol", () => {
  it("US-KI-07 initialize names version, tools capability, server and instructions; no session", async () => {
    const r = await rpc(ai(subA, "pflanzen:draft"), "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    });
    expect(r.status).toBe(200);
    expect(r.body["result"]).toMatchObject({
      protocolVersion: "2025-06-18",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "pflanzendex", version: "1.2.3" },
    });
    expect(r.body["result"].instructions).toContain("drafts");
    expect(r.headers.get("mcp-session-id")).toBeNull();
    const newer = await rpc(ai(subA, "pflanzen:draft"), "initialize", {
      protocolVersion: "2099-01-01",
    });
    expect(newer.body["result"].protocolVersion).toBe("2025-11-25");
  });

  it("US-KI-07 the initialized notification is accepted with 202 and no body; ping answers", async () => {
    const n = await post(ai(subA, "pflanzen:draft"), {
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    expect([n.status, n.text]).toEqual([202, ""]);
    expect((await rpc(ai(subA, "pflanzen:draft"), "ping")).body["result"]).toEqual({});
  });

  it("US-KI-07 an unknown method is -32601; a modern request is answered statelessly with resultType", async () => {
    expect((await rpc(ai(subA, "pflanzen:read"), "resources/list")).body["error"].code).toBe(
      -32601,
    );
    const meta = {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientCapabilities": {},
    };
    const headers = (method: string) => ({
      "mcp-protocol-version": "2026-07-28",
      "mcp-method": method,
    });
    const discover = await post(
      ai(subA, "pflanzen:read"),
      { jsonrpc: "2.0", id: "d", method: "server/discover", params: { _meta: meta } },
      headers("server/discover"),
    );
    expect(discover.body["result"]).toMatchObject({
      resultType: "complete",
      supportedVersions: ["2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26"],
      _meta: { "io.modelcontextprotocol/serverInfo": { name: "pflanzendex" } },
    });
    const call = await post(
      ai(subA, "pflanzen:read"),
      {
        jsonrpc: "2.0",
        id: 7,
        method: "tools/call",
        params: { name: "get_session", arguments: {}, _meta: meta },
      },
      { ...headers("tools/call"), "mcp-name": "get_session" },
    );
    expect(call.body["result"]).toMatchObject({ resultType: "complete", isError: false });
    const unknown = await post(
      ai(subA, "pflanzen:read"),
      { jsonrpc: "2.0", id: 8, method: "nope", params: { _meta: meta } },
      headers("nope"),
    );
    expect([unknown.status, unknown.body["error"].code]).toEqual([404, -32601]);
  });

  it("FR-KI-03 tools/list names every tool with a schema; the image check only when its source is wired", async () => {
    const r = await rpc(ai(subA, "pflanzen:read"), "tools/list");
    const tools = r.body["result"].tools as Json[];
    expect(tools.map((t) => t["name"])).toEqual([
      "get_session",
      "get_status",
      "list_tasks",
      "claim_task",
      "decline_task",
      "list_draft_types",
      "propose_draft",
      "get_discover_suggestions",
      "decide_discover_suggestion",
      "get_measurement_photo",
    ]);
    for (const t of tools) expect(t["inputSchema"]).toMatchObject({ type: "object" });
  });

  it("FR-KI-03 an unknown tool and non-object arguments are -32602, invalid arguments a tool error", async () => {
    expect((await tool(ai(subA, "pflanzen:read"), "drop_tables")).body["error"].code).toBe(-32602);
    const bad = await rpc(ai(subA, "pflanzen:read"), "tools/call", {
      name: "get_status",
      arguments: [1],
    });
    expect(bad.body["error"].code).toBe(-32602);
    const invalid = await tool(ai(subA, "pflanzen:read"), "get_discover_suggestions", {
      zone: "x",
    });
    expect(invalid.result["isError"]).toBe(true);
    expect(invalid.result["structuredContent"].error.code).toBe("input.invalid");
    const tz = await tool(ai(subA, "pflanzen:read"), "get_discover_suggestions", {
      timeZone: "Mars/Base",
    });
    expect(tz.result["structuredContent"].error.code).toBe("input.invalid");
  });
});

describe("US-KI-02 US-KI-07 tools over the routes, with their rights", () => {
  it("US-KI-07 get_session returns client and effective right as text and structured content", async () => {
    const r = await tool(ai(subA, "pflanzen:draft"), "get_session");
    expect(r.result["structuredContent"]).toEqual({ client: CLIENT, rights: "drafts" });
    expect(JSON.parse(r.result["content"][0].text)).toEqual({ client: CLIENT, rights: "drafts" });
  });

  it("US-KI-02 get_status answers the same as the route of the interface", async () => {
    const viaTool = await tool(ai(subA, "pflanzen:read"), "get_status", {
      timeZone: "Europe/Berlin",
    });
    const viaRoute = await rest(
      ai(subA, "pflanzen:read"),
      "GET",
      "/mcp/status?timeZone=Europe%2FBerlin",
    );
    expect(viaTool.result["structuredContent"]).toEqual(viaRoute.body);
  });

  it("US-KI-07 a token below the needed scope gets the route's 403 with the scope to request (step-up)", async () => {
    const r = await tool(ai(subA, "pflanzen:read"), "propose_draft", {
      type: "wish",
      source: "https://example.test",
      content: { name: "Step" },
    });
    expect(r.status).toBe(403);
    expect(r.headers.get("www-authenticate")).toContain('scope="pflanzen:draft"');
  });

  it("US-KI-07 when the keeper allows less, the tool answers a tool error with its code", async () => {
    const reader = `${OTHER}/reader`;
    await tool(ai(subB, "pflanzen:read", reader), "get_session");
    const [conn] = (await rest(web(subB), "GET", "/ai/connections")).body["connections"].filter(
      (c: Json) => c["clientId"] === reader,
    );
    await rest(web(subB), "PUT", `/ai/connections/${conn.id}/rights`, { rights: "read" });
    const r = await tool(ai(subB, "pflanzen:draft", reader), "decide_discover_suggestion", {
      species: "Aloe vera",
      decision: "yes",
      timeZone: "Europe/Berlin",
    });
    expect(r.status).toBe(200);
    expect(r.result["isError"]).toBe(true);
    expect(r.result["structuredContent"].error.code).toBe("ai.scope_insufficient");
  });

  it("US-KI-05 discover: the deck is read, 'later' writes nothing", async () => {
    const deck = await tool(ai(subA, "pflanzen:read"), "get_discover_suggestions", {
      timeZone: "Europe/Berlin",
    });
    expect(deck.result["isError"]).toBe(false);
    const later = await tool(ai(subA, "pflanzen:draft"), "decide_discover_suggestion", {
      species: "Aloe vera",
      decision: "later",
      timeZone: "Europe/Berlin",
      idempotencyKey: randomUUID(),
    });
    expect(later.result["structuredContent"]).toEqual({ mode: "none" });
  });
});

describe("US-KI-09 US-KI-08 US-KI-04 KI-R6 drafts, tasks and photos stay in the own account", () => {
  const name = `MCP ${randomUUID()}`;
  let measurementId = "";

  beforeAll(async () => {
    const tag = randomUUID()
      .replace(/[0-9-]/g, "")
      .slice(0, 8);
    const sp = await rest(web(subA), "POST", "/species", {
      latinName: `Mcpfoto${tag} test`,
      germanName: `Mcpfoto ${tag}`,
      difficulty: 2,
      standardLevel: 3,
      lightDemandLux: 40000,
      growthMeasure: "rosette_diameter",
      etiolationSigns: "Rosette streckt sich.",
      successCriteria: "Dichte, flache Rosette.",
    });
    const specimen = await rest(web(subA), "POST", "/specimens", {
      speciesId: sp.body["id"],
      marker: "mcp",
      timeZone: "Europe/Berlin",
    });
    const m = await rest(web(subA), "POST", `/specimens/${specimen.body["id"]}/measurements`, {
      timeZone: "Europe/Berlin",
      value: 9.5,
    });
    measurementId = m.body["id"];
    const account = (await admin.query("select id from account where subject = $1", [subA])).rows[0]
      .id;
    await photos.put(account, "mcp.jpg", new Uint8Array([7, 8, 9]), "image/jpeg");
    await admin.query("update measurement set photo = 'mcp.jpg' where id = $1", [measurementId]);
  });

  it("US-KI-09 propose_draft stores a draft for the keeper only; a stranger's inbox stays empty", async () => {
    const r = await tool(ai(subA, "pflanzen:draft"), "propose_draft", {
      type: "wish",
      source: "https://example.test/source",
      content: { name },
    });
    expect(r.result["isError"]).toBe(false);
    expect(r.result["structuredContent"]).toMatchObject({
      type: "wish",
      status: "open",
      created: true,
    });
    const inbox = async (sub: string) =>
      (await rest(web(sub), "GET", "/ai/drafts")).body["drafts"] as Json[];
    expect((await inbox(subA)).some((d) => d["content"].name === name)).toBe(true);
    expect((await inbox(subB)).some((d) => d["content"].name === name)).toBe(false);
    const types = await tool(ai(subA, "pflanzen:read"), "list_draft_types");
    expect(types.result["structuredContent"].types).toContain("wish");
  });

  it("US-KI-08 tasks: the own client lists and claims, a stranger's client sees nothing and claims nothing", async () => {
    const created = await rest(web(subA), "POST", "/ai/tasks", {
      type: "species_profile",
      reference: "Aloe vera",
    });
    const id = created.body["task"].id;
    const listed = await tool(ai(subA, "pflanzen:read"), "list_tasks");
    expect(listed.result["structuredContent"].tasks.map((t: Json) => t["id"])).toContain(id);
    expect(listed.result["structuredContent"].tasks[0].prompt).toContain("claim_task");
    const strangers = await tool(ai(subB, "pflanzen:read", OTHER), "list_tasks");
    expect(JSON.stringify(strangers.result)).not.toContain(id);
    const foreign = await tool(ai(subB, "pflanzen:draft", `${OTHER}/drafter`), "claim_task", {
      taskId: id,
    });
    expect(foreign.result["structuredContent"].error.code).toBe("ai.task_not_found");
    const own = await tool(ai(subA, "pflanzen:draft"), "claim_task", { taskId: id });
    expect(own.result["structuredContent"]).toMatchObject({ id, status: "in_progress" });
    const declined = await tool(ai(subA, "pflanzen:draft"), "decline_task", { taskId: id });
    expect(declined.result["structuredContent"]).toMatchObject({ id, status: "declined" });
  });

  it("US-KI-04 the photo comes as image content to the own client only", async () => {
    const own = await tool(ai(subA, "pflanzen:read"), "get_measurement_photo", { measurementId });
    expect(own.result["content"]).toEqual([
      { type: "image", data: Buffer.from([7, 8, 9]).toString("base64"), mimeType: "image/jpeg" },
    ]);
    const foreign = await tool(ai(subB, "pflanzen:read", OTHER), "get_measurement_photo", {
      measurementId,
    });
    expect(foreign.result["isError"]).toBe(true);
    expect(JSON.stringify(foreign.result)).not.toContain(Buffer.from([7, 8, 9]).toString("base64"));
  });

  it("US-KI-10 tool calls show in the keeper's log like route calls", async () => {
    const log = (await rest(web(subA), "GET", "/ai/log")).body["log"] as Json[];
    const ops = log.map((e) => e["operation"]);
    for (const op of ["propose_draft", "measurement_photo", "claim_task"])
      expect(ops).toContain(op);
  });
});
