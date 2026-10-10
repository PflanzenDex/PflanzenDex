import { randomUUID } from "node:crypto";
import { migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";

// US-ENT-01: the deck of suggestions through the API (real PostgreSQL, `make db-up`).
let pool: Pool;
let admin: Pool; // superuser fixture pool: shared taxon rows and cleanup (QG-D1)
const suffix = randomUUID()
  .replace(/[^a-z]/g, "")
  .slice(0, 8);
const genus = `Discoverus${suffix}`;
const wished = `${genus} gewuenscht`;
const open = `${genus} offen`;
const keeper = `ent1-keeper-${randomUUID()}`;
const other = `ent1-other-${randomUUID()}`;
const verifier = async (token: string) =>
  token.startsWith("valid:")
    ? { sub: token.slice(6), email: "x@example.test", name: "T", email_verified: true }
    : null;
let app: ReturnType<typeof createApp>;
// `taxon` is one shared table that the taxonomy build job replaces as a whole (US-POK-03). Both test files hold this
// session lock while they own taxon rows, so a parallel build can neither wipe the rows seeded here nor add its own.
const TAXON_LOCK = "select pg_advisory_lock(hashtext('pflanzendex-test-taxon'))";
let lock: PoolClient | undefined;

const get = (sub: string | null, query = "timeZone=Europe%2FBerlin") =>
  app.request(`/discover/suggestions?${query}`, {
    headers: sub ? { authorization: `Bearer valid:${sub}` } : {},
  });
type Deck = { deck: number; suggestions: { species: string; reasons: string[] }[]; empty: unknown };
const mine = async (sub: string, query?: string) => (await (await get(sub, query)).json()) as Deck;
// All decks in order, not only the first: foreign taxa left in the shared database may fill deck 1 (size 10).
const cards = async (sub: string) => {
  const all: Deck["suggestions"] = [];
  for (let deck = 1; ; deck++) {
    const page = await mine(sub, `timeZone=Europe%2FBerlin&deck=${deck}`);
    if (page.suggestions.length === 0) return all;
    all.push(...page.suggestions);
  }
};
const species = async (sub: string) => (await cards(sub)).map((s) => s.species);

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  lock = await admin.connect();
  await lock.query(TAXON_LOCK);
  await migrate(pool);
  app = createApp({ reviewer: verifier, pool });
  for (const latinName of [wished, open])
    await admin.query(
      `insert into taxon (latin_name, status, accepted_name, genus, family, catalog_fingerprint, built_at)
       values ($1, 'resolved', $1, $2, 'Testaceae', 'ent1', now())`,
      [latinName, genus],
    );
});
afterAll(async () => {
  try {
    await admin.query("delete from taxon where genus = $1", [genus]);
    await admin.query(
      "delete from wish where account_id in (select id from account where subject = any($1))",
      [[keeper, other]],
    );
    await admin.query("delete from account where subject = any($1)", [[keeper, other]]);
  } finally {
    await lock?.query("select pg_advisory_unlock(hashtext('pflanzendex-test-taxon'))");
    lock?.release();
    await pool.end();
    await admin.end();
  }
});

describe("US-ENT-01 suggestions through the API", () => {
  it("US-ENT-01 answers 401 without a token and 400 input.invalid for a bad time zone or deck", async () => {
    expect((await get(null)).status).toBe(401);
    for (const query of [
      "timeZone=Mars%2FBase",
      "timeZone=Europe%2FBerlin&deck=0",
      "timeZone=Europe%2FBerlin&deck=x",
    ]) {
      const bad = await get(keeper, query);
      expect(bad.status).toBe(400);
      expect(((await bad.json()) as { error: { code: string } }).error.code).toBe("input.invalid");
    }
  });

  it("US-ENT-01 suggests a species with reasons and leaves out the species of an own wish, for the own account only", async () => {
    expect(await species(keeper)).toEqual(expect.arrayContaining([wished, open]));
    const made = await app.request("/wishes", {
      method: "POST",
      headers: {
        authorization: `Bearer valid:${keeper}`,
        "content-type": "application/json",
        "idempotency-key": randomUUID(),
      },
      body: JSON.stringify({ name: wished }),
    });
    expect(made.status).toBe(201);
    const after = await species(keeper);
    expect(after).toContain(open);
    expect(after).not.toContain(wished);
    // The wish is private (P-04, FR-ENT-08): another account still gets the species suggested.
    expect(await species(other)).toContain(wished);
    const card = (await cards(keeper)).find((s) => s.species === open);
    expect(card?.reasons.length).toBeGreaterThanOrEqual(1);
    expect(card?.reasons.length).toBeLessThanOrEqual(3);
  });
});

describe("US-ENT-03 reasons through the API", () => {
  it("US-ENT-03 asks the stock port for the signed-in account only,", async () => {
    const asked: string[] = [];
    const withStock = createApp({
      reviewer: verifier,
      pool,
      zoneStock: {
        stock: async (userId: string) => {
          asked.push(userId);
          return [];
        },
        buffer: async () => 2,
      },
    });
    const res = await withStock.request("/discover/suggestions?timeZone=Europe%2FBerlin", {
      headers: { authorization: `Bearer valid:${keeper}` },
    });
    expect(res.status).toBe(200);
    expect(asked).toHaveLength(1);
    expect(asked[0]).not.toBe("");
  });
});

describe("US-ENT-04 decisions through the API", () => {
  const decideAs = (sub: string | null, input: Record<string, unknown>) =>
    app.request("/discover/decisions", {
      method: "POST",
      headers: {
        ...(sub ? { authorization: `Bearer valid:${sub}` } : {}),
        "content-type": "application/json",
        "idempotency-key": randomUUID(),
      },
      body: JSON.stringify({ timeZone: "Europe/Berlin", ...input }),
    });
  const wishesOf = (sub: string) =>
    admin.query<{ name: string; status: string; source: string; decided_at: string | null }>(
      `select name, status, source, to_char(decided_at, 'YYYY-MM-DD') as decided_at from wish
        where account_id in (select id from account where subject = $1) and name like $2`,
      [sub, `${genus}%`],
    );
  const target = `${genus} entschieden`;
  const later = `${genus} spaeter`;

  beforeAll(async () => {
    for (const latinName of [target, later])
      await admin.query(
        `insert into taxon (latin_name, status, accepted_name, genus, family, catalog_fingerprint, built_at)
         values ($1, 'resolved', $1, $2, 'Testaceae', 'ent4', now())`,
        [latinName, genus],
      );
  });

  it("US-ENT-04 answers 401 without a token and 400 for a bad decision", async () => {
    expect((await decideAs(null, { species: target, decision: "yes" })).status).toBe(401);
    expect((await decideAs(keeper, { species: target, decision: "maybe" })).status).toBe(400);
  });

  it("US-ENT-04 Yes writes one open Discover wish, a repeat writes no second one, and the species leaves the deck", async () => {
    const first = await decideAs(keeper, { species: target, decision: "yes" });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ decision: "yes", saved: true });
    const again = await decideAs(keeper, { species: target, decision: "no" });
    expect(await again.json()).toEqual({ decision: "no", saved: false });
    const rows = (await wishesOf(keeper)).rows.filter((r) => r.name === target);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "wishlist", source: "discover" });
    expect(rows[0]?.decided_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(await species(keeper)).not.toContain(target);
  });

  it("US-ENT-04 No keeps the species as a discarded wish, Later writes nothing", async () => {
    const no = await decideAs(keeper, { species: `${genus} offen`, decision: "no" });
    expect(await no.json()).toEqual({ decision: "no", saved: true });
    const skip = await decideAs(keeper, { species: later, decision: "later" });
    expect(await skip.json()).toEqual({ decision: "later", saved: false });
    const names = (await wishesOf(keeper)).rows.map((r) => [r.name, r.status]);
    expect(names).toContainEqual([`${genus} offen`, "discarded"]);
    expect(names.map(([n]) => n)).not.toContain(later);
    expect(await species(keeper)).toContain(later);
  });

  it("US-ENT-04 is private: the decision of one account changes nothing for another (P-04, FR-ENT-08)", async () => {
    expect((await wishesOf(other)).rows).toEqual([]);
    expect(await species(other)).toEqual(expect.arrayContaining([target, `${genus} offen`]));
  });

  it("US-ENT-04 refuses a species that is not suggested with 409 discover.not_suggested", async () => {
    const r = await decideAs(keeper, { species: `${genus} erfunden`, decision: "yes" });
    expect(r.status).toBe(409);
    expect(((await r.json()) as { error: { code: string } }).error.code).toBe(
      "discover.not_suggested",
    );
  });
});

describe("US-ENT-05 suggestions learn from decisions through the API", () => {
  it("US-ENT-05 after a Ja the species of the same genus say so, for that account only (FR-ENT-07)", async () => {
    const liked = `${genus} gemocht`;
    for (const latinName of [liked, `${genus} verwandt`])
      await admin.query(
        `insert into taxon (latin_name, status, accepted_name, genus, family, catalog_fingerprint, built_at)
         values ($1, 'resolved', $1, $2, 'Testaceae', 'ent5', now())`,
        [latinName, genus],
      );
    const yes = await app.request("/discover/decisions", {
      method: "POST",
      headers: {
        authorization: `Bearer valid:${other}`,
        "content-type": "application/json",
        "idempotency-key": randomUUID(),
      },
      body: JSON.stringify({ species: liked, decision: "yes", timeZone: "Europe/Berlin" }),
    });
    expect(yes.status).toBe(200);
    const mineCard = (await cards(other)).find((s) => s.species === `${genus} verwandt`);
    expect(mineCard?.reasons.join(" ")).toContain("Du hast 1 Art der Gattung");
    const theirs = (await cards(keeper)).find((s) => s.species === `${genus} verwandt`);
    // The keeper has decided on other species: the count comes from the own wishes only.
    expect(theirs?.reasons.join(" ")).not.toContain("Du hast 1 Art der Gattung");
  });
});
