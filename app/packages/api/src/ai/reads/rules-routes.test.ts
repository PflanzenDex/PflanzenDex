import { randomUUID } from "node:crypto";
import {
  AI_OPERATION_CLASSES,
  ERROR_TEXTS,
  NO_FEATURES,
  SPECIES_NAMING_RULE,
  rightNeeded,
} from "@pflanzendex/core";
import { migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, type AppOptions } from "../../app";
import { MCP_TOOLS } from "../mcp/tools";

// US-KI-13: the rule discovery through the MCP tools (real PostgreSQL, `make db-up`).
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
let pool: Pool;
let admin: Pool;
let app: ReturnType<typeof createApp>;
const subA = `ki13-${randomUUID()}`;
const subB = `ki13-${randomUUID()}`;
const CLIENT = "https://claude.ai/oauth/mcp-oauth-client-metadata";
const NOW = new Date("2026-11-06T10:00:00Z");
const web = (sub: string) => `valid:${sub}`;
const ai = (sub: string, scope = "pflanzen:read") => `ai|${sub}|${CLIENT}|${scope}`;
const options = (features?: AppOptions["features"]): AppOptions => ({
  reviewer: async (t) =>
    t.startsWith("valid:")
      ? { sub: t.slice(6), email: "x@example.test", name: "T", email_verified: true }
      : null,
  pool,
  clock: () => NOW,
  ...(features ? { features } : {}),
  ai: {
    verifier: async (t) => {
      const [kind, sub, client, scope] = t.split("|");
      return kind === "ai"
        ? { sub, email: `${sub}@example.test`, name: "T", email_verified: true, azp: client, scope }
        : null;
    },
    resource: "https://pflanzendex.example/mcp",
    issuer: "https://login.example/realms/p",
  },
});

async function call(token: string, path: string) {
  const res = await app.request(path, { headers: { authorization: `Bearer ${token}` } });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Json };
}
let rpcId = 1;
async function rpc(sub: string, method: string, params: Json = {}) {
  const res = await app.request("/mcp", {
    method: "POST",
    headers: {
      authorization: `Bearer ${ai(sub)}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method, params }),
  });
  return ((await res.json()) as Json)["result"] as Json;
}
async function tool(sub: string, name: string, args: Json = {}) {
  const result = await rpc(sub, "tools/call", { name, arguments: args });
  return { error: result["isError"] as boolean, body: result["structuredContent"] as Json };
}
const logOf = async (sub: string, operation: string) =>
  ((await call(web(sub), "/ai/log")).body["log"] as Json[]).filter(
    (e) => e["operation"] === operation,
  ).length;

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp(options());
  for (const sub of [subA, subB]) await call(web(sub), "/account");
});
afterAll(async () => {
  await admin.query("delete from account where subject = any($1)", [[subA, subB]]);
  await pool.end();
  await admin.end();
});

describe("US-KI-13 learn the rules before writing", () => {
  it("US-KI-13 describe_rules lists per area every offered tool with its schema, class and right (FR-KI-12, FR-KI-17)", async () => {
    const { error, body } = await tool(subA, "describe_rules");
    expect(error).toBe(false);
    const listed = ((await rpc(subA, "tools/list"))["tools"] as Json[]).map((t) => [
      t["name"],
      t["inputSchema"],
    ]);
    const ops = (body["areas"] as Json[]).flatMap((a) => a["operations"] as Json[]);
    expect(ops.map((o) => [o["tool"], o["inputSchema"]])).toEqual(listed);
    for (const o of ops) {
      const tool = MCP_TOOLS.find((t) => t.name === o["tool"]);
      expect(o["operation"]).toBe(tool?.operation);
      expect(o["class"]).toBe(AI_OPERATION_CLASSES[o["operation"]]);
      expect(o["right"]).toBe(rightNeeded(o["operation"]));
    }
    expect((body["areas"] as Json[]).map((a) => a["area"])).toEqual(
      expect.arrayContaining(["account", "collection", "rules"]),
    );
  });

  it("US-KI-13 the schemas carry the enumerations and limits of the checks (growth measures, qualities, decisions)", async () => {
    const { body } = await tool(subA, "describe_rules");
    const text = JSON.stringify(body["areas"]);
    for (const value of ["rosette_diameter", "shoot_length", "etiolated", "later"])
      expect(text).toContain(`"${value}"`);
    expect(text).toContain('"maxLength"');
  });

  it("US-KI-13 the naming rule, every error code with its meaning, a version and a revision", async () => {
    const { body } = await tool(subA, "describe_rules");
    expect(body["naming"]).toEqual(JSON.parse(JSON.stringify(SPECIES_NAMING_RULE)));
    const codes = (body["errors"] as Json)["codes"] as Json[];
    expect(codes.map((c) => c["code"])).toEqual(Object.keys(ERROR_TEXTS));
    expect(body["version"]).toEqual(expect.any(Number));
    expect(body["revision"]).toMatch(/^[0-9a-f]{8}$/);
  });

  it("US-KI-13 check_species_name gives the normal form or the code a proposal would get, with the rule", async () => {
    const ok = await tool(subA, "check_species_name", { name: "dracaena TRIFASCIATA" });
    expect(ok.body).toMatchObject({ valid: true, normalized: "Dracaena trifasciata" });
    for (const [name, code] of [
      ["Citrus x limon", "catalog.name_hybrid"],
      ["Aloe vera var. chinensis", "catalog.name_addition"],
      ["Aloe sp.", "input.invalid"],
    ]) {
      const r = await tool(subA, "check_species_name", { name });
      expect(r.error).toBe(false);
      expect(r.body).toMatchObject({
        valid: false,
        code,
        reason: ERROR_TEXTS[code as "input.invalid"],
      });
      expect((r.body["rule"] as string[]).length).toBeGreaterThan(0);
    }
  });

  it("US-KI-13 the proposal refuses the same name with the same code (one rule, no second path)", async () => {
    const res = await app.request("/species", {
      method: "POST",
      headers: {
        authorization: `Bearer ${web(subA)}`,
        "content-type": "application/json",
        "idempotency-key": randomUUID(),
      },
      body: JSON.stringify({ latinName: "Citrus x limon" }),
    });
    const body = (await res.json()) as Json;
    const fields = ((body["error"] as Json)["details"] as Json[] | undefined) ?? [];
    expect(fields.find((d) => d["field"] === "latinName")?.["code"]).toBe("catalog.name_hybrid");
  });

  it("US-KI-13 the discovery holds no account data: two accounts get the same answer", async () => {
    const a = await tool(subA, "describe_rules");
    const b = await tool(subB, "describe_rules");
    expect(a.body).toEqual(b.body);
  });

  it("US-KI-13 each call is one entry in the keeper's AI log (FR-KI-19)", async () => {
    const before = await logOf(subB, "describe_rules");
    await tool(subB, "describe_rules");
    expect(await logOf(subB, "describe_rules")).toBe(before + 1);
    const names = await logOf(subB, "check_species_name");
    await tool(subB, "check_species_name", { name: "Ficus benjamina" });
    expect(await logOf(subB, "check_species_name")).toBe(names + 1);
  });

  it("US-KI-13 the read right suffices, a missing token is refused, and while 'ai' is off the routes answer 404", async () => {
    expect((await call(ai(subA), "/mcp/rules")).status).toBe(200);
    expect((await app.request("/mcp/rules")).status).toBe(401);
    const before = app;
    app = createApp(options(NO_FEATURES));
    try {
      expect((await call(ai(subA), "/mcp/rules")).status).toBe(404);
      expect((await call(ai(subA), "/mcp/rules/species-name?name=Aloe")).status).toBe(404);
    } finally {
      app = before;
    }
  });
});
