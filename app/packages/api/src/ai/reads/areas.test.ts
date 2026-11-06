import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  AI_LOG_LIMIT,
  AI_OPERATION_CLASSES,
  AREA_NAMES,
  AREA_READS,
  NO_FEATURES,
  NOT_RELEASED_CALLS,
  type NotReleasedCall,
} from "@pflanzendex/core";
import { migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, type AppOptions } from "../../app";
import { NOT_RELEASED_TOOLS } from "../mcp/tools";

// US-KI-12: every other area through the MCP tools, against the app's own views (real PostgreSQL, `make db-up`).
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
let pool: Pool;
let admin: Pool;
let app: ReturnType<typeof createApp>;
const tag = randomUUID()
  .replace(/[0-9]/g, (z) => "ghijklmnop"[Number(z)] ?? "x")
  .replace(/-/g, "")
  .slice(0, 10);
const subA = `ki12-${randomUUID()}`;
const subB = `ki12-${randomUUID()}`;
const CLIENT = "https://claude.ai/oauth/mcp-oauth-client-metadata";
const NOW = new Date("2026-11-02T10:00:00Z");
const TZ = "Europe/Berlin";
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

async function call(token: string, method: string, path: string, body?: unknown) {
  const res = await app.request(path, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "idempotency-key": randomUUID(),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Json };
}
let rpcId = 1;
async function rpc(sub: string, method: string, params: Json, scope?: string) {
  const res = await app.request("/mcp", {
    method: "POST",
    headers: {
      authorization: `Bearer ${ai(sub, scope)}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method, params }),
  });
  return ((await res.json()) as Json)["result"] as Json;
}
async function tool(sub: string, name: string, args: Json = {}, scope?: string) {
  const result = await rpc(sub, "tools/call", { name, arguments: args }, scope);
  return { error: result["isError"] as boolean, body: result["structuredContent"] as Json };
}
const REFUSED = "refused: ai.not_released";
/** The AI log of an account as the keeper sees it: newest first, at most AI_LOG_LIMIT entries (FR-KI-19). */
const logOf = async (sub: string): Promise<Json[]> =>
  (await call(web(sub), "GET", "/ai/log")).body["log"];
/** The refusals of an account's log, counted per operation (FR-KI-22). */
async function refusedBy(sub: string) {
  const counts: Record<string, number> = {};
  for (const e of await logOf(sub))
    if (e["effect"] === REFUSED) counts[e["operation"]] = (counts[e["operation"]] ?? 0) + 1;
  return counts;
}

/** One account's data: an own species, a zone, a location, a specimen with a measurement and a treatment, a wish. */
async function data(sub: string, who: string) {
  const species = await call(web(sub), "POST", "/species", {
    latinName: `Kiarea${tag}${who} vera`,
    germanName: `Bereich ${tag} ${who}`,
    difficulty: 2,
    standardLevel: 3,
    lightDemandLux: 40000,
    growthMeasure: "rosette_diameter",
    etiolationSigns: "Rosette streckt sich.",
    successCriteria: "Dichte, flache Rosette.",
  });
  const zone = await call(web(sub), "POST", "/light-zones", {
    name: `Hell ${who}`,
    luxCeiling: 30000,
  });
  const location = await call(web(sub), "POST", "/locations", {
    name: `Regal ${who}`,
    kind: "indoor",
    lightZoneId: zone.body["id"],
  });
  const specimen = (
    await call(web(sub), "POST", "/specimens", {
      speciesId: species.body["id"],
      locationId: location.body["id"],
      marker: "blau",
      timeZone: TZ,
    })
  ).body;
  await call(web(sub), "POST", `/specimens/${specimen["id"]}/measurements`, {
    timeZone: TZ,
    value: 10,
    date: "2026-11-01",
  });
  await call(web(sub), "POST", "/treatments", {
    specimenIds: [specimen["id"]],
    reason: `Wolllaus ${tag} ${who}`,
    date: "2026-11-05",
  });
  await call(web(sub), "POST", "/wishes", { name: `Kiwish${tag}${who} alba` });
  return { species: species.body, specimen };
}
let A: Awaited<ReturnType<typeof data>>;
let B: Awaited<ReturnType<typeof data>>;

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp(options());
  for (const sub of [subA, subB]) await call(web(sub), "GET", "/account");
  A = await data(subA, "anna");
  B = await data(subB, "bernd");
});
afterAll(async () => {
  const subs = [[subA, subB]];
  const mine = "(select id from account where subject = any($1))";
  for (const table of ["treatment", "measurement", "wish", "specimen"])
    await admin.query(`delete from ${table} where account_id in ${mine}`, subs);
  await admin.query(
    `delete from species where id in (select object_id from review_case where account_id in ${mine})`,
    subs,
  );
  await admin.query("delete from account where subject = any($1)", subs);
  await pool.end();
  await admin.end();
});

const q = `?timeZone=${TZ}`;
/** Per tool: its arguments, the app's own route and the part of the app's answer the tool returns. */
const SAME_AS_APP: readonly [string, Json, () => string, (b: Json) => unknown][] = [
  ["list_care_phases", { timeZone: TZ }, () => `/care-phases${q}`, (b) => b["phases"]],
  ["list_open_treatments", { timeZone: TZ }, () => `/treatments${q}`, (b) => b["treatments"]],
  [
    "list_treatment_history",
    { specimen: "bereich" },
    () => `/treatments/history?specimenId=${A.specimen["id"]}`,
    (b) => b["treatments"],
  ],
  ["list_watering_due", { timeZone: TZ }, () => `/watering/due${q}`, (b) => b["due"]],
  ["list_reminders", {}, () => "/reminders", (b) => b["reminders"]],
  ["get_reminder_settings", {}, () => "/reminders/settings", (b) => b],
  ["list_wish_candidates", {}, () => "/wishes/candidates", (b) => b["candidates"]],
  ["list_bought_wishes", {}, () => "/wishes/bought", (b) => b["bought"]],
  ["list_discarded_wishes", {}, () => "/wishes/discarded", (b) => b["discarded"]],
  [
    "get_pokedex_ownership",
    { timeZone: TZ },
    () => `/pokedex/ownership${q}`,
    (b) => b["ownership"],
  ],
  ["list_pokedex_cards", { timeZone: TZ }, () => `/pokedex/cards${q}`, (b) => b["cards"]],
  ["get_achievements", { timeZone: TZ }, () => `/achievements${q}`, (b) => b],
  [
    "get_growth_records",
    { specimen: "bereich" },
    () => `/achievements/growth/${A.specimen["id"]}`,
    (b) => b,
  ],
  ["list_care_profiles", {}, () => "/care-profiles", (b) => b["entries"]],
  ["get_difficulty_comparison", {}, () => "/specimens/difficulty", (b) => b["rows"]],
  ["list_collection_hints", {}, () => "/specimens/hints", (b) => b["hints"]],
  ["list_my_corrections", {}, () => "/catalog/corrections/mine", (b) => b],
  ["list_unlocks", { timeZone: TZ }, () => `/onboarding/unlocks${q}`, (b) => b["functions"]],
];
/** The tool's answer without the paging and data markers, in the shape of the app's answer. */
function appShape(name: string, body: Json) {
  const MARKERS = ["dataFields", "items", "total", "offset", "limit", "nextOffset"];
  const items = body["items"];
  const rest = Object.fromEntries(Object.entries(body).filter(([k]) => !MARKERS.includes(k)));
  const list = AREA_READS[name as keyof typeof AREA_READS].list;
  if (list === null) return rest;
  if (name === "get_pokedex_ownership") return { ...rest, caught: items };
  return items;
}

describe("US-KI-12 every other area through the AI client", () => {
  it.each(SAME_AS_APP)(
    "US-KI-12 %s returns what the app's own view returns (KI-R10, P-01)",
    async (name, args, path, pick) => {
      const page = AREA_READS[name as keyof typeof AREA_READS].list ? { limit: 100 } : {};
      // The shared catalog may change between the two reads while other test files approve species (Pokédex cards):
      // compare a fresh pair up to three times.
      let pair: [unknown, unknown] = [null, undefined];
      for (let i = 0; i < 3 && !isDeepStrictEqual(...pair); i++) {
        const r = await tool(subA, name, { ...args, ...page });
        expect(r.error).toBe(false);
        const view = pick((await call(web(subA), "GET", path())).body);
        const long = Array.isArray(view) && view.length > 100;
        if (long) expect(r.body["total"]).toBe(view.length);
        pair = [appShape(name, r.body), long ? view.slice(0, 100) : view];
      }
      expect(pair[0]).toEqual(pair[1]);
    },
  );

  it("US-KI-12 the light distribution and the profile are the app's values; free texts are named as data", async () => {
    const r = (await tool(subA, "get_light_distribution")).body;
    expect(r["distribution"]).toEqual(
      (await call(web(subA), "GET", "/specimens/distribution")).body["distribution"],
    );
    expect(r["overview"]).toEqual((await call(web(subA), "GET", "/specimens/light-overview")).body);
    const profile = (await tool(subA, "get_profile")).body;
    const app = (await call(web(subA), "GET", "/account/profile")).body;
    expect(profile).toEqual({
      displayName: app["displayName"],
      timeZone: app["timeZone"],
      dataFields: ["displayName"],
    });
    const treatments = (await tool(subA, "list_open_treatments", { timeZone: TZ })).body;
    expect(treatments["dataFields"]).toContain("items[].reason");
  });

  it("US-KI-12 catalog gaps follow the app's rule: reviewers only (the same refusal)", async () => {
    const r = await tool(subA, "list_catalog_gaps");
    const app = await call(web(subA), "GET", "/catalog/gaps");
    expect(r.body["error"].code).toBe(app.body["error"].code);
  });

  it("US-KI-12 the AI log and the drafts inbox show this connection's entries only", async () => {
    const log = (await tool(subA, "list_ai_log", { limit: 100 })).body;
    expect(log["total"]).toBeGreaterThan(0);
    const [connection] = (await call(web(subA), "GET", "/ai/connections")).body["connections"];
    for (const e of log["items"]) expect(e.connectionId).toBe(connection.id);
    expect(log["items"].map((e: Json) => e["operation"])).toContain("list_care_phases");
    const drafts = (await tool(subA, "list_ai_drafts")).body;
    for (const d of drafts["items"]) expect(d.connectionId).toBe(connection.id);
  });

  it("US-KI-12 every area tool is listed with a described input schema", async () => {
    const tools = (await rpc(subA, "tools/list", {}))["tools"] as Json[];
    const names = tools.map((t) => t["name"]);
    for (const name of AREA_NAMES) expect(names).toContain(name);
    for (const name of ["list_friends", "list_offers", "get_recommendations"])
      expect(names).not.toContain(name);
  });

  it("US-KI-12 friends' data, sharing, offers, swaps and recommendations answer ai.not_released and are logged (FR-KI-10)", async () => {
    for (const name of [
      "list_friends",
      "get_feed",
      "get_sharing_settings",
      "list_offers",
      "list_swaps",
      "get_recommendations",
    ]) {
      const r = await tool(subA, name);
      expect(r.error).toBe(true);
      expect(r.body["error"].code).toBe("ai.not_released");
    }
    expect((await call(ai(subA), "GET", "/mcp/not-released/friends")).status).toBe(403);
    const log = (await call(web(subA), "GET", "/ai/log")).body["log"] as Json[];
    expect(
      log.some(
        (e) => e["operation"] === "friends_data" && e["effect"] === "refused: ai.not_released",
      ),
    ).toBe(true);
  });

  it("US-KI-12 while 'ai' is off for the account the area tools answer 404", async () => {
    const before = app;
    app = createApp(options(NO_FEATURES));
    try {
      expect((await call(ai(subA), "GET", "/mcp/care-profiles")).status).toBe(404);
    } finally {
      app = before;
    }
  });
});

/** The arguments a tool needs, for account B. */
const argsOf = (name: (typeof AREA_NAMES)[number]): Json => {
  const needs = AREA_READS[name].needs;
  if (needs === "timeZone") return { timeZone: TZ };
  if (needs === "specimen") return { specimen: B.specimen["id"] };
  return {};
};

describe("US-KI-12 tenant isolation per tool (P-04, FR-KI-23)", () => {
  it.each(AREA_NAMES.map((n) => [n]))(
    "US-KI-12 %s: a connection of B sees none of A's rows",
    async (name) => {
      const r = await tool(subB, name, argsOf(name));
      const text = JSON.stringify(r.body);
      expect(text).not.toContain(`${tag} anna`);
      expect(text).not.toContain(`${tag}anna`);
      expect(text).not.toContain(A.specimen["id"]);
      expect(text).not.toContain(A.species["id"]);
    },
  );

  it("US-KI-12 list_treatment_history and get_growth_records: A's specimen by id or name is not_found for B", async () => {
    for (const name of ["list_treatment_history", "get_growth_records"])
      for (const specimen of [A.specimen["id"], A.specimen["name"]]) {
        const r = await tool(subB, name, { specimen });
        expect(r.body["error"].code).toBe("specimen.not_found");
        expect(JSON.stringify(r.body)).not.toContain("anna");
      }
    const res = await call(ai(subB), "GET", `/mcp/treatments/history?specimen=${A.specimen["id"]}`);
    expect(res.status).toBe(404); // never 403: no existence leak
  });
});

// FR-KI-22 US-KI-12: a human-only name answers ai.not_released whatever the right, is logged with its operation and is not
// listed; an attempt shows in the log of its own account only (P-04). The accounts are their own, so every log is whole.
describe("FR-KI-22 US-KI-12 human-only names answer ai.not_released and are logged", () => {
  const subT = `ki22-names-${randomUUID()}`;
  const subP = `ki22-attempt-${randomUUID()}`;
  const subQ = `ki22-other-${randomUUID()}`;
  const HUMAN_ONLY = Object.keys(NOT_RELEASED_TOOLS);
  const SCOPES = ["pflanzen:read", "pflanzen:write"];

  beforeAll(async () => {
    for (const sub of [subT, subP, subQ]) await call(web(sub), "GET", "/account");
  });
  afterAll(async () => {
    await admin.query("delete from account where subject = any($1)", [[subT, subP, subQ]]);
  });

  it("FR-KI-22 every attempt of the human-only names fits the log window, so each count below is exact", () => {
    expect(HUMAN_ONLY.length * SCOPES.length).toBeLessThanOrEqual(AI_LOG_LIMIT);
  });

  it.each(HUMAN_ONLY.flatMap((name) => SCOPES.map((scope) => [name, scope])))(
    "FR-KI-22 US-KI-12 %s with %s answers ai.not_released, is logged with its operation and is not listed",
    async (name, scope) => {
      const before = await refusedBy(subT);
      // A human-only name never checks its arguments: an unknown field changes nothing of the refusal.
      const answer = await rpc(subT, "tools/call", { name, arguments: { noSuchField: 1 } }, scope);
      expect(answer).toMatchObject({
        isError: true,
        structuredContent: { error: { code: "ai.not_released" } },
      });
      const operation = NOT_RELEASED_CALLS[NOT_RELEASED_TOOLS[name] as NotReleasedCall];
      expect((await refusedBy(subT))[operation]).toBe((before[operation] ?? 0) + 1);
      const listed = (await rpc(subT, "tools/list", {}, scope))["tools"] as Json[];
      expect(listed.map((t) => t["name"])).not.toContain(name);
    },
  );

  it("FR-KI-22 US-KI-12 an attempt of account A shows in A's AI log and not in B's (P-04)", async () => {
    const operation = "profile_settings";
    const a = await refusedBy(subP);
    const b = await refusedBy(subQ);
    await rpc(subP, "tools/call", { name: "set_display_name", arguments: {} }, "pflanzen:write");
    expect((await refusedBy(subP))[operation]).toBe((a[operation] ?? 0) + 1);
    expect(await refusedBy(subQ)).toEqual(b);
    await rpc(subQ, "tools/call", { name: "set_display_name", arguments: {} }, "pflanzen:write");
    expect((await refusedBy(subQ))[operation]).toBe((b[operation] ?? 0) + 1);
    expect((await refusedBy(subP))[operation]).toBe((a[operation] ?? 0) + 1);
  });
});

// US-ONB-09: the AI client reads the keeper's switches through list_unlocks and has no tool to change them (FR-KI-22).
describe("US-ONB-09 the AI client and the keeper switches", () => {
  // An account of its own: its switch is set and cleared here, so no other test of this file reads a changed state.
  const subS = `ki12-switch-${randomUUID()}`;
  const WISH = "wishlist";
  let beforeSwitch: Json | undefined;
  let switchedOff: Json | undefined;

  beforeAll(async () => {
    await call(web(subS), "GET", "/account");
  });
  afterAll(async () => {
    await admin.query("delete from account where subject = $1", [subS]);
  });

  /** One function as the AI client's list_unlocks answers it (the tool pages its items). */
  const toolEntry = async (sub: string, id: string) => {
    const r = await tool(sub, "list_unlocks", { timeZone: TZ, limit: 100 });
    expect(r.error).toBe(false);
    return (r.body["items"] as Json[]).find((f) => f["id"] === id);
  };
  /** The same function in the app's own answer, `GET /onboarding/unlocks`, through the web token. */
  const appEntry = async (sub: string, id: string) =>
    ((await call(web(sub), "GET", `/onboarding/unlocks${q}`)).body["functions"] as Json[]).find(
      (f) => f["id"] === id,
    );
  /** The whole JSON-RPC answer, result or error, for a method or a tool that is not offered. */
  const rawRpc = async (sub: string, method: string, params: Json, scope?: string) => {
    const res = await app.request("/mcp", {
      method: "POST",
      headers: {
        authorization: `Bearer ${ai(sub, scope)}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method, params }),
    });
    return (await res.json()) as Json;
  };

  it("US-ONB-09 a switched-off feature reads as keeper_off through list_unlocks: not announced, with its keeperSwitch (FR-KI-22)", async () => {
    beforeSwitch = await toolEntry(subS, WISH);
    expect(beforeSwitch).toBeDefined();
    const off = await call(web(subS), "PUT", "/onboarding/switches/wishlist", {
      enabled: false,
      timeZone: TZ,
    });
    expect(off.status).toBe(200);
    switchedOff = await toolEntry(subS, WISH);
    expect(switchedOff).toMatchObject({
      state: "keeper_off",
      announced: false,
      keeperSwitch: WISH,
    });
    expect(switchedOff).toEqual(await appEntry(subS, WISH));
  });

  it("US-ONB-09 the switch of one account is not visible to another: B's AI client reads no keeper_off (P-04)", async () => {
    const bEntry = await toolEntry(subB, WISH);
    expect(bEntry).toBeDefined();
    expect(bEntry?.["state"]).not.toBe("keeper_off");
    expect(bEntry).toEqual(await appEntry(subB, WISH));
  });

  it("FR-KI-22 US-ONB-09 an AI client has no tool to switch a feature; a call answers ai.not_released and is logged, its PUT is refused and the state stays (FR-KI-22, KI-R8)", async () => {
    const switching = Object.entries(AI_OPERATION_CLASSES).filter(([op]) => op.includes("switch"));
    expect(switching.length).toBeGreaterThan(0);
    expect(switching.filter(([, cls]) => cls !== "never")).toEqual([]);
    for (const scope of ["pflanzen:read", "pflanzen:write"]) {
      const listed = (await rawRpc(subS, "tools/list", {}, scope))["result"]["tools"] as Json[];
      expect(listed.map((t) => String(t["name"])).filter((n) => n.includes("switch"))).toEqual([]);
    }
    const refusedBefore = (await refusedBy(subS))["keeper_switches"] ?? 0;
    for (const name of ["switch_feature", "account.switch_feature"]) {
      const answer = await rpc(
        subS,
        "tools/call",
        { name, arguments: { feature: WISH, enabled: true } },
        "pflanzen:write",
      );
      expect(answer).toMatchObject({
        isError: true,
        structuredContent: { error: { code: "ai.not_released" } },
      });
    }
    expect((await refusedBy(subS))["keeper_switches"]).toBe(refusedBefore + 2);
    const put = await call(ai(subS, "pflanzen:write"), "PUT", "/onboarding/switches/wishlist", {
      enabled: true,
      timeZone: TZ,
    });
    expect(put.status).toBe(401);
    expect(put.body["error"].code).toBe("not_signed_in");
    expect(await appEntry(subS, WISH)).toEqual(switchedOff);
  });

  it("US-ONB-09 switching the feature on again reads as not keeper_off, as before the switch (FR-KI-22)", async () => {
    const on = await call(web(subS), "PUT", "/onboarding/switches/wishlist", {
      enabled: true,
      timeZone: TZ,
    });
    expect(on.status).toBe(200);
    const entry = await toolEntry(subS, WISH);
    expect(entry?.["state"]).not.toBe("keeper_off");
    expect(entry).toEqual(beforeSwitch);
    expect(entry).toEqual(await appEntry(subS, WISH));
  });
});
