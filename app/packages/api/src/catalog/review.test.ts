import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openOwnerPool, openFixturePool, holdTaxonLock } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-BES-10 over HTTP with real PostgreSQL (`make db-up`): two plant keepers and an operator share the catalog.
let pool: Pool;
let admin: Pool; // superuser fixture pool: setup, cleanup and cross-tenant observation (QG-D1)
// Approves species: holds the taxon lock so a parallel taxonomy build sees a stable catalog (#646).
let releaseTaxa: (() => Promise<void>) | undefined;
const run = randomUUID()
  .replace(/[0-9]/g, (z) => "ghijklmnop"[Number(z)] ?? "x")
  .replace(/-/g, "")
  .slice(0, 8);
const [subKeeper, subOther, subOperator] = ["keeper", "other", "operator"].map(
  (n) => `${n}-${randomUUID()}`,
) as [string, string, string];
const verifier: TokenVerifier = async (token) => {
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

let counter = 0;
const profile = (extra: Record<string, unknown> = {}) => ({
  latinName: `Reviewus ${run}${"x".repeat(++counter)}`,
  difficulty: 2,
  standardLevel: 3,
  lightDemandLux: 40000,
  growthMeasure: "rosette_diameter",
  etiolationSigns: "Rosette streckt sich.",
  successCriteria: "Dichte, flache Rosette.",
  source: "RHS",
  ...extra,
});
const propose = async (sub: string, extra: Record<string, unknown> = {}) => {
  const r = await call(sub, "POST", "/species", profile(extra));
  if (r.status !== 201) throw new Error(JSON.stringify(r.body));
  const list = await call(subOperator, "GET", "/review");
  const entry = list.body["entries"].find(
    (e: { species: { id: string } | null }) => e.species?.id === r.body["id"],
  );
  return { speciesId: r.body["id"] as string, caseId: entry.reviewCase.id as string };
};
const approve = async (sub: string) => {
  const p = await propose(sub);
  expect(
    (await call(subOperator, "POST", `/review/${p.caseId}/decide`, { status: "reviewed" })).status,
  ).toBe(200);
  return p;
};

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  releaseTaxa = await holdTaxonLock(admin);
  await migrate(pool);
  app = createApp({ reviewer: verifier, pool });
  for (const sub of [subKeeper, subOther, subOperator]) await call(sub, "GET", "/species");
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
    const subs = [[subKeeper, subOther, subOperator]];
    await client.query(
      `delete from species where id in (select object_id from review_case where account_id in ${accounts})`,
      subs,
    );
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

describe("US-BES-10 access (P-04, FR-BES-14)", () => {
  it.each([
    ["GET", "/review"],
    ["POST", "/review/00000000-0000-4000-8000-000000000001/decide"],
    ["POST", "/review/00000000-0000-4000-8000-000000000001/merge"],
  ])("%s %s without token: 401", async (method, path) => {
    expect((await call(null, method, path, method === "POST" ? {} : undefined)).status).toBe(401);
  });

  it("US-BES-10 plant keepers cannot list, approve, reject or merge; the proposal stays untouched", async () => {
    const p = await propose(subKeeper);
    for (const sub of [subKeeper, subOther]) {
      expect(await call(sub, "GET", "/review")).toMatchObject({
        status: 403,
        body: { error: { code: "access.denied" } },
      });
      for (const input of [{ status: "reviewed" }, { status: "rejected", reason: "nein" }])
        expect((await call(sub, "POST", `/review/${p.caseId}/decide`, input)).status).toBe(403);
      expect(
        (await call(sub, "POST", `/review/${p.caseId}/merge`, { targetSpeciesId: p.speciesId }))
          .status,
      ).toBe(403);
    }
    expect((await call(subKeeper, "GET", `/species/${p.speciesId}`)).body).toMatchObject({
      reviewStatus: "proposal",
    });
  });

  it("US-BES-10 the review list shows the content of proposals to reviewers only, with count and age", async () => {
    const p = await propose(subKeeper, { source: undefined });
    const list = await call(subOperator, "GET", "/review");
    expect(list.status).toBe(200);
    expect(list.body["open"]).toBeGreaterThanOrEqual(1);
    expect(typeof list.body["oldestOpenAt"]).toBe("string");
    const entry = list.body["entries"].find(
      (e: { reviewCase: { id: string } }) => e.reviewCase.id === p.caseId,
    );
    expect(entry).toMatchObject({
      aiCreated: false,
      issues: [{ field: "source", reason: "source_missing" }],
      species: { id: p.speciesId, reviewStatus: "proposal", own: false },
    });
    // The operator's search does not list the foreign proposal; it is visible only through the review path.
    const search = await call(subOperator, "GET", `/species?q=${encodeURIComponent(run)}`);
    expect(search.body["species"].map((s: { id: string }) => s.id)).not.toContain(p.speciesId);
  });
});

describe("US-BES-10 who is a reviewer", () => {
  it("US-BES-10 the own account tells the UI whether it may review", async () => {
    expect((await call(subOperator, "GET", "/account")).body["reviewer"]).toBe(true);
    expect((await call(subKeeper, "GET", "/account")).body["reviewer"]).toBe(false);
  });
});

describe("US-BES-10 approve and reject", () => {
  it("US-BES-10 approval without a source is refused naming the field; with it the species becomes visible to all", async () => {
    const p = await propose(subKeeper, { source: undefined });
    const refused = await call(subOperator, "POST", `/review/${p.caseId}/decide`, {
      status: "reviewed",
    });
    expect(refused).toMatchObject({
      status: 409,
      body: { error: { code: "review.approval_incomplete", details: [{ field: "source" }] } },
    });
    expect((await call(subOther, "GET", `/species/${p.speciesId}`)).status).toBe(404);

    const ready = await propose(subKeeper);
    const ok = await call(subOperator, "POST", `/review/${ready.caseId}/decide`, {
      status: "reviewed",
    });
    expect(ok).toMatchObject({
      status: 200,
      body: { status: "reviewed", creatorId: expect.any(String) },
    });
    expect((await call(subOther, "GET", `/species/${ready.speciesId}`)).body).toMatchObject({
      reviewStatus: "reviewed",
      own: false,
    });
    const again = await call(subOperator, "POST", `/review/${ready.caseId}/decide`, {
      status: "reviewed",
    });
    expect(again).toMatchObject({
      status: 409,
      body: { error: { code: "review.status_invalid" } },
    });
  });

  it("US-BES-10 rejecting needs a reason; the creator sees it, others still see nothing", async () => {
    const p = await propose(subKeeper);
    const without = await call(subOperator, "POST", `/review/${p.caseId}/decide`, {
      status: "rejected",
    });
    expect(without).toMatchObject({
      status: 400,
      body: { error: { code: "review.reason_missing" } },
    });
    const done = await call(subOperator, "POST", `/review/${p.caseId}/decide`, {
      status: "rejected",
      reason: "Quelle für den Lichtbedarf fehlt",
    });
    expect(done.status).toBe(200);
    expect((await call(subKeeper, "GET", `/species/${p.speciesId}`)).body).toMatchObject({
      reviewStatus: "rejected",
      reviewReason: "Quelle für den Lichtbedarf fehlt",
    });
    expect((await call(subOther, "GET", `/species/${p.speciesId}`)).status).toBe(404);
  });

  it("US-BES-10 an unknown case is 404", async () => {
    const r = await call(subOperator, "POST", `/review/${randomUUID()}/decide`, {
      status: "reviewed",
    });
    expect(r).toMatchObject({ status: 404, body: { error: { code: "review.not_found" } } });
  });
});

describe("US-BES-10 merge (FR-BES-11, P-10)", () => {
  it("US-BES-10 the creator's specimens move to the existing species, the proposal disappears", async () => {
    const target = await approve(subOther);
    const p = await propose(subKeeper);
    const made = await call(subKeeper, "POST", "/specimens", {
      speciesId: p.speciesId,
      timeZone: "Europe/Berlin",
    });
    expect(made.status).toBe(201);
    const merged = await call(subOperator, "POST", `/review/${p.caseId}/merge`, {
      targetSpeciesId: target.speciesId,
    });
    expect(merged).toMatchObject({
      status: 200,
      body: {
        reviewCase: { status: "merged", mergedInto: target.speciesId },
        moved: [
          { kind: "specimen", moved: 1, kept: 0 },
          { kind: "care_profile", moved: 0, kept: 0 },
        ],
      },
    });
    const mine = await call(subKeeper, "GET", "/specimens");
    expect(mine.body["specimens"].map((s: { speciesId: string }) => s.speciesId)).toEqual([
      target.speciesId,
    ]);
    expect((await call(subKeeper, "GET", `/species/${p.speciesId}`)).status).toBe(404);
  });

  it("US-BES-10 invalid targets: itself, a not approved species, nothing; a plant keeper may not merge", async () => {
    const p = await propose(subKeeper);
    const foreignProposal = await propose(subOther);
    const merge = (sub: string, input: unknown) =>
      call(sub, "POST", `/review/${p.caseId}/merge`, input);
    for (const targetSpeciesId of [p.speciesId, foreignProposal.speciesId])
      expect(await merge(subOperator, { targetSpeciesId })).toMatchObject({
        status: 409,
        body: { error: { code: "review.merge_target_invalid" } },
      });
    expect((await merge(subOperator, {})).status).toBe(400);
    const target = await approve(subOther);
    expect((await merge(subKeeper, { targetSpeciesId: target.speciesId })).status).toBe(403);
    expect((await merge(subOperator, { targetSpeciesId: target.speciesId })).status).toBe(200);
    expect(await merge(subOperator, { targetSpeciesId: target.speciesId })).toMatchObject({
      status: 409,
      body: { error: { code: "review.status_invalid" } },
    });
  });

  it("US-BES-10 a marker clash on the target is a 409 conflict and nothing is merged", async () => {
    const target = await approve(subOther);
    const p = await propose(subKeeper);
    for (const speciesId of [target.speciesId, p.speciesId])
      expect(
        (
          await call(subKeeper, "POST", "/specimens", {
            speciesId,
            marker: "rot",
            timeZone: "Europe/Berlin",
          })
        ).status,
      ).toBe(201);
    const r = await call(subOperator, "POST", `/review/${p.caseId}/merge`, {
      targetSpeciesId: target.speciesId,
    });
    expect(r).toMatchObject({ status: 409, body: { error: { code: "review.merge_conflict" } } });
    expect((await call(subKeeper, "GET", `/species/${p.speciesId}`)).body).toMatchObject({
      reviewStatus: "proposal",
    });
  });
});
