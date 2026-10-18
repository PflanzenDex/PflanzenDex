import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openOwnerPool, openFixturePool, holdTaxonLock } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../../app";

// US-BES-13 over HTTP with real PostgreSQL (`make db-up`): the gap list of the shared catalog.
let pool: Pool;
let admin: Pool;
let releaseTaxa: (() => Promise<void>) | undefined;
const run = randomUUID()
  .replace(/[0-9]/g, (z) => "ghijklmnop"[Number(z)] ?? "x")
  .replace(/-/g, "")
  .slice(0, 8);
const [subKeeper, subOperator] = ["keeper", "operator"].map((n) => `${n}-${randomUUID()}`) as [
  string,
  string,
];
const verifier: NonNullable<AppOptions["reviewer"]> = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
let app: ReturnType<typeof createApp>;
type Response = { status: number; body: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function call(
  sub: string | null,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (sub) headers["authorization"] = `Bearer valid:${sub}`;
  headers["idempotency-key"] = randomUUID();
  const res = await app.request(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  releaseTaxa = await holdTaxonLock(admin);
  await migrate(pool);
  app = createApp({ reviewer: verifier, pool });
  for (const sub of [subKeeper, subOperator]) await call(sub, "GET", "/species");
  await admin.query(
    "insert into account_role (account, role) select id, 'operator' from account where subject = $1",
    [subOperator],
  );
});
afterAll(async () => {
  const client = await admin.connect();
  try {
    await client.query("begin");
    await client.query("set local session_replication_role = replica");
    const accounts = "(select id from account where subject = any($1))";
    const subs = [[subKeeper, subOperator]];
    await client.query(
      `delete from species where id in (select object_id from review_case where account_id in ${accounts})`,
      subs,
    );
    await client.query(`delete from review_case where account_id in ${accounts}`, subs);
    await client.query("set local session_replication_role = default");
    await client.query(`delete from account where id in ${accounts}`, subs);
    await client.query("commit");
  } finally {
    client.release();
    await pool.end();
    await releaseTaxa?.();
    await admin.end();
  }
});

describe("US-BES-13 gap list", () => {
  it("GET /catalog/gaps without token: 401", async () => {
    expect((await call(null, "GET", "/catalog/gaps")).status).toBe(401);
  });

  it("US-BES-13 a plant keeper gets access.denied (P-04)", async () => {
    expect(await call(subKeeper, "GET", "/catalog/gaps")).toMatchObject({
      status: 403,
      body: { error: { code: "access.denied" } },
    });
  });

  it("US-BES-13 an approved species with unknown fields appears with next steps and the last check; proposals do not", async () => {
    const latinName = `Gapus ${run}`;
    const created = await call(subKeeper, "POST", "/species", {
      latinName,
      difficulty: 2,
      standardLevel: 3,
      lightDemandLux: 40000,
      growthMeasure: "rosette_diameter",
      etiolationSigns: "Rosette streckt sich.",
      successCriteria: "Dichte, flache Rosette.",
      source: "RHS",
    });
    expect(created.status).toBe(201);
    const speciesId = created.body["id"] as string;
    const before = await call(subOperator, "GET", "/catalog/gaps");
    expect(before.status).toBe(200);
    expect(before.body["entries"].some((e: { id: string }) => e.id === speciesId)).toBe(false);

    const list = await call(subOperator, "GET", "/review");
    const kase = list.body["entries"].find(
      (e: { species: { id: string } | null }) => e.species?.id === speciesId,
    );
    expect(
      (
        await call(subOperator, "POST", `/review/${kase.reviewCase.id}/decide`, {
          status: "reviewed",
        })
      ).status,
    ).toBe(200);
    await admin.query(
      `insert into catalog_source_snapshot (species_id, source, retrieved_at, link, license, raw)
       values ($1, 'gbif', '2026-10-05T08:00:00Z', 'https://api.gbif.org/x', 'CC0-1.0', null)`,
      [speciesId],
    );

    const after = await call(subOperator, "GET", "/catalog/gaps");
    const entry = after.body["entries"].find((e: { id: string }) => e.id === speciesId);
    expect(entry.latinName).toBe(latinName);
    expect(entry.lastCheck).toEqual({ source: "gbif", retrievedAt: "2026-10-05T08:00:00Z" });
    expect(entry.gaps).toContainEqual({ field: "germanName", nextStep: "fill_job" });
    expect(entry.gaps).toContainEqual({ field: "substrate", nextStep: "research" });
  });
});
