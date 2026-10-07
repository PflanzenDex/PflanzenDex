import { randomUUID } from "node:crypto";
import { migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import type { Pool } from "pg";
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

const get = (sub: string | null, query = "timeZone=Europe%2FBerlin") =>
  app.request(`/discover/suggestions?${query}`, {
    headers: sub ? { authorization: `Bearer valid:${sub}` } : {},
  });
type Deck = { deck: number; suggestions: { species: string; reasons: string[] }[]; empty: unknown };
const mine = async (sub: string, query?: string) => (await (await get(sub, query)).json()) as Deck;
const species = async (sub: string) =>
  (await mine(sub, "timeZone=Europe%2FBerlin&deck=1")).suggestions.map((s) => s.species);

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
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
  await admin.query("delete from taxon where genus = $1", [genus]);
  await admin.query(
    "delete from wish where account_id in (select id from account where subject = any($1))",
    [[keeper, other]],
  );
  await admin.query("delete from account where subject = any($1)", [[keeper, other]]);
  await pool.end();
  await admin.end();
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
    const card = (await mine(keeper)).suggestions.find((s) => s.species === open);
    expect(card?.reasons.length).toBeGreaterThanOrEqual(1);
    expect(card?.reasons.length).toBeLessThanOrEqual(3);
  });
});
