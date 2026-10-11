import { randomUUID } from "node:crypto";
import { migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";

// US-ENT-08: Discover through the AI interface (real PostgreSQL, `make db-up`).
let pool: Pool;
let admin: Pool;
let lock: PoolClient | undefined;
const suffix = randomUUID()
  .replace(/[^a-z]/g, "")
  .slice(0, 8);
const genus = `Aidiscoverus${suffix}`;
const species = [`${genus} eins`, `${genus} zwei`, `${genus} drei`];
const subA = `ent8-${randomUUID()}`;
const subB = `ent8-${randomUUID()}`;
const CLIENT = "https://claude.ai/oauth/mcp-oauth-client-metadata";
const TAXON_LOCK = "select pg_advisory_lock(hashtext('pflanzendex-test-taxon'))";
const web = (sub: string) => `valid:${sub}`;
const ai = (sub: string, scope: string) => `ai|${sub}|${CLIENT}|${scope}`;
let app: ReturnType<typeof createApp>;

const call = async (token: string, method: string, path: string, body?: unknown) => {
  const res = await app.request(path, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "idempotency-key": randomUUID(),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
};
// The keeper raises the right a connection may use (ADR 0013: the first call starts at the lower of token and "drafts").
const allow = async (sub: string, scope: string, rights: string) => {
  await call(ai(sub, scope), "GET", "/mcp/session");
  const list = (await call(web(sub), "GET", "/ai/connections")).body["connections"];
  await call(web(sub), "PUT", `/ai/connections/${list[0].id}/rights`, { rights });
};
const deck = (token: string) =>
  call(token, "GET", "/mcp/discover/suggestions?timeZone=Europe%2FBerlin");
const decide = (token: string, name: string, decision: string) =>
  call(token, "POST", "/mcp/discover/decisions", {
    species: name,
    decision,
    timeZone: "Europe/Berlin",
  });
const wishes = async (sub: string) =>
  JSON.stringify((await call(web(sub), "GET", "/wishes/candidates")).body);
// Foreign taxa in the shared database may fill deck 1: find the deck that holds the species.
const suggested = async (sub: string, scope = "pflanzen:read") => {
  for (let n = 1; n <= 30; n++) {
    const r = await call(
      ai(sub, scope),
      "GET",
      `/mcp/discover/suggestions?timeZone=Europe%2FBerlin&deck=${n}`,
    );
    const hit = (r.body["deck"]?.suggestions ?? []).filter((s: { species: string }) =>
      species.includes(s.species),
    );
    if (hit.length > 0 || (r.body["deck"]?.suggestions ?? []).length === 0) return hit;
  }
  return [];
};

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  lock = await admin.connect();
  await lock.query(TAXON_LOCK);
  await migrate(pool);
  app = createApp({
    reviewer: async (t) =>
      t.startsWith("valid:")
        ? { sub: t.slice(6), email: "x@example.test", name: "T", email_verified: true }
        : null,
    pool,
    ai: {
      verifier: async (t) => {
        const [kind, sub, client, scope] = t.split("|");
        return kind === "ai"
          ? {
              sub,
              email: `${sub}@example.test`,
              name: "T",
              email_verified: true,
              azp: client,
              scope: scope?.replace(/\+/g, " "),
            }
          : null;
      },
      resource: "https://pflanzendex.example/mcp",
      issuer: "https://login.example/realms/p",
    },
  });
  for (const latinName of species)
    await admin.query(
      `insert into taxon (latin_name, status, accepted_name, genus, family, catalog_fingerprint, built_at)
       values ($1, 'resolved', $1, $2, 'Aitestaceae', 'ent8', now())`,
      [latinName, genus],
    );
  for (const sub of [subA, subB]) await call(web(sub), "GET", "/account");
});
afterAll(async () => {
  try {
    await admin.query("delete from taxon where genus = $1", [genus]);
    await admin.query(
      "delete from wish where account_id in (select id from account where subject = any($1))",
      [[subA, subB]],
    );
    await admin.query("delete from account where subject = any($1)", [[subA, subB]]);
  } finally {
    await lock?.query("select pg_advisory_unlock(hashtext('pflanzendex-test-taxon'))");
    lock?.release();
    await pool.end();
    await admin.end();
  }
});

describe("US-ENT-08 Discover through the AI client", () => {
  it("US-ENT-08 the client reads the same deck as the view, with reasons, and a web token cannot", async () => {
    expect((await deck(web(subA))).status).toBe(401);
    expect(
      (await call(ai(subA, "pflanzen:read"), "GET", "/mcp/discover/suggestions?timeZone=Mars"))
        .status,
    ).toBe(400);
    const hit = await suggested(subA);
    expect(hit.length).toBeGreaterThan(0);
    expect(hit[0].reasons.length).toBeGreaterThan(0);
    const view = (await call(web(subA), "GET", "/discover/suggestions?timeZone=Europe%2FBerlin"))
      .body;
    expect(Object.keys((await deck(ai(subA, "pflanzen:read"))).body["deck"]).sort()).toEqual(
      Object.keys(view).sort(),
    );
  });

  it("US-ENT-08 a client with 'create drafts' sends a decision as a draft; no wish arises until the keeper adopts it", async () => {
    const name = species[0] as string;
    await allow(subA, "pflanzen:draft", "drafts");
    const r = await decide(ai(subA, "pflanzen:draft"), name, "yes");
    expect([r.status, r.body["mode"]]).toEqual([201, "draft"]);
    expect(await wishes(subA)).not.toContain(name);
    const [d] = (await call(web(subA), "GET", "/ai/drafts")).body["drafts"].filter(
      (x: { type: string }) => x.type === "discover_decision",
    );
    expect(d).toMatchObject({ status: "open", content: { species: name, decision: "yes" } });
    expect((await call(web(subA), "POST", `/ai/drafts/${d.id}/adopt`)).status).toBe(200);
    expect(await wishes(subA)).toContain(name);
  });

  it("US-ENT-08 a client with 'write' decides at once, with the effect of US-ENT-04; 'later' writes nothing", async () => {
    const name = species[1] as string;
    await allow(subA, "pflanzen:write", "write");
    expect((await decide(ai(subA, "pflanzen:write"), name, "later")).body).toMatchObject({
      mode: "none",
    });
    expect(await wishes(subA)).not.toContain(name);
    const r = await decide(ai(subA, "pflanzen:write"), name, "yes");
    expect(r.body).toMatchObject({ mode: "written", result: { decision: "yes", saved: true } });
    expect(await wishes(subA)).toContain(name);
  });

  it("US-ENT-08 a read client may not decide, an invented species is refused, a stranger's wishes stay untouched (KI-R6)", async () => {
    expect((await decide(ai(subB, "pflanzen:read"), species[2] as string, "yes")).status).toBe(403);
    await allow(subB, "pflanzen:write", "write");
    expect(
      (await decide(ai(subB, "pflanzen:write"), "Nichtvorgeschlagen erfunden", "yes")).body["error"]
        .code,
    ).toBe("discover.not_suggested");
    expect((await decide(ai(subB, "pflanzen:write"), species[2] as string, "maybe")).status).toBe(
      400,
    );
    expect(await wishes(subB)).not.toContain(species[0]);
  });

  it("US-ENT-08 US-KI-10 the calls show in the log", async () => {
    const ops = (await call(web(subA), "GET", "/ai/log")).body["log"].map(
      (e: { operation: string }) => e.operation,
    );
    expect(ops).toEqual(expect.arrayContaining(["discover_suggestions", "discover_decide"]));
  });
});
