import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openOwnerPool, openFixturePool, holdTaxonLock } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../../app";

// US-BES-16 over HTTP with real PostgreSQL (`make db-up`): corrections, decisions and the history of a field.
let pool: Pool;
let admin: Pool;
let releaseTaxa: (() => Promise<void>) | undefined;
const run = randomUUID()
  .replace(/[0-9]/g, (z) => "ghijklmnop"[Number(z)] ?? "x")
  .replace(/-/g, "")
  .slice(0, 8);
const [subKeeper, subOther, subOperator] = ["keeper", "other", "operator"].map(
  (n) => `${n}-${randomUUID()}`,
) as [string, string, string];
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

/** An approved species whose German name is "Alt" (created by the keeper, approved by the operator). */
async function approvedSpecies(name: string): Promise<string> {
  const created = await call(subKeeper, "POST", "/species", {
    latinName: `Corrx ${name}${run}`,
    germanName: "Alt",
    difficulty: 2,
    standardLevel: 3,
    lightDemandLux: 40000,
    growthMeasure: "rosette_diameter",
    etiolationSigns: "Rosette streckt sich.",
    successCriteria: "Dichte, flache Rosette.",
    source: "RHS",
  });
  expect(created.status).toBe(201);
  const id = created.body["id"] as string;
  const list = await call(subOperator, "GET", "/review");
  const kase = list.body["entries"].find(
    (e: { species: { id: string } | null }) => e.species?.id === id,
  );
  await call(subOperator, "POST", `/review/${kase.reviewCase.id}/decide`, { status: "reviewed" });
  return id;
}
const propose = (speciesId: string, value: string, sub = subKeeper, extra: object = {}) =>
  call(sub, "POST", "/catalog/corrections", {
    speciesId,
    field: "germanName",
    value,
    reason: "Steht so im Buch",
    ...extra,
  });
const germanName = async (id: string) =>
  (await admin.query("select german_name, version from species where id = $1", [id])).rows[0];

describe("US-BES-16 corrections over HTTP", () => {
  it("requires sign-in on every route", async () => {
    for (const [method, path] of [
      ["POST", "/catalog/corrections"],
      ["GET", "/catalog/corrections"],
      ["GET", "/catalog/corrections/mine"],
      ["POST", `/catalog/corrections/${randomUUID()}/accept`],
      ["POST", `/catalog/corrections/${randomUUID()}/vote`],
      ["GET", `/catalog/species/${randomUUID()}/corrections`],
      ["GET", `/catalog/history/${randomUUID()}/germanName`],
      ["POST", `/catalog/history/${randomUUID()}/germanName/revert`],
    ] as const)
      expect((await call(null, method, path)).status).toBe(401);
  });

  it("US-BES-16 propose, review list, accept: the catalog changes only on accept and the history shows it", async () => {
    const id = await approvedSpecies("accept");
    const created = await propose(id, "Neu", subKeeper, { source: "Buch S. 4" });
    expect(created).toMatchObject({
      status: 201,
      body: { status: "open", oldValue: "Alt", proposedValue: "Neu" },
    });
    expect(await germanName(id)).toMatchObject({ german_name: "Alt", version: 1 });

    const list = await call(subOperator, "GET", "/catalog/corrections");
    expect(list.status).toBe(200);
    expect(
      list.body["entries"].find((e: { id: string }) => e.id === created.body["id"]),
    ).toMatchObject({ currentValue: "Alt", proposedValue: "Neu", reason: "Steht so im Buch" });
    const accepted = await call(
      subOperator,
      "POST",
      `/catalog/corrections/${created.body["id"]}/accept`,
    );
    expect(accepted).toMatchObject({ status: 200, body: { status: "accepted", version: 2 } });
    expect(await germanName(id)).toMatchObject({ german_name: "Neu", version: 2 });

    const asKeeper = await call(subOther, "GET", `/catalog/history/${id}/germanName`);
    expect(asKeeper.status).toBe(200);
    expect(asKeeper.body).toEqual([
      expect.objectContaining({
        version: 2,
        value: "Neu",
        origin: "community",
        citation: "Buch S. 4",
        setBy: null,
      }),
    ]);
    const asOperator = await call(subOperator, "GET", `/catalog/history/${id}/germanName`);
    expect(asOperator.body[0].setBy).toEqual(expect.any(String));
    expect(
      (await call(subOperator, "POST", `/catalog/corrections/${created.body["id"]}/accept`)).body,
    ).toMatchObject({ error: { code: "correction.decided" } });
  });

  it("US-BES-16 reject needs a reason that the creator reads; the catalog stays", async () => {
    const id = await approvedSpecies("reject");
    const created = await propose(id, "Neu");
    const path = `/catalog/corrections/${created.body["id"]}/reject`;
    expect((await call(subOperator, "POST", path, {})).body).toMatchObject({
      error: { code: "review.reason_missing" },
    });
    expect((await call(subOperator, "POST", path, { reason: "Quelle passt nicht" })).status).toBe(
      200,
    );
    expect(await germanName(id)).toMatchObject({ german_name: "Alt", version: 1 });
    const mine = await call(subKeeper, "GET", "/catalog/corrections/mine");
    expect(mine.body.find((c: { id: string }) => c.id === created.body["id"])).toMatchObject({
      status: "rejected",
      decisionReason: "Quelle passt nicht",
    });
    expect((await call(subOther, "GET", "/catalog/corrections/mine")).body).toEqual([]);
  });

  it("US-BES-16 a plant keeper can neither list, decide nor revert (P-04, FR-BES-06)", async () => {
    const id = await approvedSpecies("rights");
    const created = await propose(id, "Neu");
    for (const [method, path, body] of [
      ["GET", "/catalog/corrections", undefined],
      ["POST", `/catalog/corrections/${created.body["id"]}/accept`, undefined],
      ["POST", `/catalog/corrections/${created.body["id"]}/reject`, { reason: "x" }],
      ["POST", `/catalog/history/${id}/germanName/revert`, { version: 1 }],
    ] as const)
      expect(await call(subOther, method, path, body)).toMatchObject({
        status: 403,
        body: { error: { code: "access.denied" } },
      });
    expect(await germanName(id)).toMatchObject({ german_name: "Alt", version: 1 });
  });

  it("US-BES-16 validation: unknown species, same value, duplicate, wrong field (P-03)", async () => {
    const id = await approvedSpecies("input");
    expect(await propose(randomUUID(), "Neu")).toMatchObject({
      status: 404,
      body: { error: { code: "species.not_found" } },
    });
    expect(await propose(id, "Alt")).toMatchObject({
      status: 409,
      body: { error: { code: "correction.no_change" } },
    });
    expect(await propose(id, "Neu", subKeeper, { field: "wateringHint" })).toMatchObject({
      status: 400,
      body: { error: { code: "input.invalid" } },
    });
    const first = await propose(id, "Neu");
    const dup = await propose(id, "Neu", subOther);
    expect(dup).toMatchObject({
      status: 409,
      body: { error: { code: "correction.duplicate_open", data: { id: first.body["id"] } } },
    });
  });

  it("US-BES-16 revert: the earlier value returns as a new version, nothing is deleted (P-10)", async () => {
    const id = await approvedSpecies("revert");
    await admin.query("update species set family_latin = null where id = $1", [id]);
    const fresh = await propose(id, "Neu");
    await call(subOperator, "POST", `/catalog/corrections/${fresh.body["id"]}/accept`);
    // Version 1 has no history row (the creator typed it); revert to a recorded version needs one.
    expect(
      (await call(subOperator, "POST", `/catalog/history/${id}/germanName/revert`, { version: 1 }))
        .body,
    ).toMatchObject({ error: { code: "correction.version_not_found" } });
    const second = await propose(id, "Neuer");
    await call(subOperator, "POST", `/catalog/corrections/${second.body["id"]}/accept`);
    const reverted = await call(subOperator, "POST", `/catalog/history/${id}/germanName/revert`, {
      version: 2,
    });
    expect(reverted).toMatchObject({ status: 200, body: { version: 4 } });
    expect(await germanName(id)).toMatchObject({ german_name: "Neu", version: 4 });
    const history = await call(subKeeper, "GET", `/catalog/history/${id}/germanName`);
    expect(
      history.body.map((v: { version: number; origin: string }) => [v.version, v.origin]),
    ).toEqual([
      [4, "reviewer"],
      [3, "community"],
      [2, "community"],
    ]);
    expect(
      (await call(subOperator, "POST", `/catalog/history/${id}/germanName/revert`, { version: 4 }))
        .body,
    ).toMatchObject({ error: { code: "correction.unchanged" } });
  });

  it("US-BES-16 the history of an unknown species or a field outside the three answers like a missing one", async () => {
    expect(
      (await call(subKeeper, "GET", `/catalog/history/${randomUUID()}/germanName`)).status,
    ).toBe(404);
    expect(
      (await call(subKeeper, "GET", `/catalog/history/${randomUUID()}/wateringHint`)).status,
    ).toBe(400);
  });
});

describe("US-BES-15 votes over HTTP: a signal for reviewers, never an automatism", () => {
  it("US-BES-15 two accounts: counts without names, one vote each, the creator cannot vote, the catalog stays", async () => {
    const id = await approvedSpecies("vote");
    const created = await propose(id, "Neu");
    const cid = created.body["id"] as string;
    const url = `/catalog/corrections/${cid}/vote`;

    expect(await call(subKeeper, "POST", url, { vote: "confirm" })).toMatchObject({
      status: 409,
      body: { error: { code: "correction.own_vote" } },
    });
    expect((await call(subOther, "POST", url, { vote: "confirm" })).status).toBe(200);
    expect((await call(subOther, "POST", url, { vote: "dispute" })).status).toBe(200);
    expect(await call(subOther, "POST", url, { vote: "maybe" })).toMatchObject({ status: 400 });

    const seen = await call(subOther, "GET", `/catalog/species/${id}/corrections`);
    expect(seen.body).toMatchObject([
      { id: cid, confirmations: 0, disputes: 1, myVote: "dispute", mine: false },
    ]);
    const asCreator = await call(subKeeper, "GET", `/catalog/species/${id}/corrections`);
    expect(asCreator.body).toMatchObject([{ id: cid, disputes: 1, myVote: null, mine: true }]);
    expect(JSON.stringify([seen.body, asCreator.body])).not.toMatch(/keeper-|other-|operator-/);

    const list = await call(subOperator, "GET", "/catalog/corrections");
    expect(list.body["entries"].find((e: { id: string }) => e.id === cid)).toMatchObject({
      confirmations: 0,
      disputes: 1,
    });
    expect(await germanName(id)).toMatchObject({ german_name: "Alt", version: 1 });

    expect((await call(subOther, "POST", url, { vote: "none" })).status).toBe(200);
    expect(
      (await call(subOther, "GET", `/catalog/species/${id}/corrections`)).body[0],
    ).toMatchObject({
      disputes: 0,
      myVote: null,
    });
  });

  it("US-BES-15 a decided or unknown correction and an unknown species answer like missing ones", async () => {
    const id = await approvedSpecies("voteb");
    const cid = (await propose(id, "Neu")).body["id"] as string;
    await call(subOperator, "POST", `/catalog/corrections/${cid}/reject`, { reason: "Nein" });
    expect(
      await call(subOther, "POST", `/catalog/corrections/${cid}/vote`, { vote: "confirm" }),
    ).toMatchObject({
      status: 409,
      body: { error: { code: "correction.decided" } },
    });
    expect(
      await call(subOther, "POST", `/catalog/corrections/${randomUUID()}/vote`, {
        vote: "confirm",
      }),
    ).toMatchObject({ status: 404, body: { error: { code: "correction.not_found" } } });
    expect(
      await call(subOther, "GET", `/catalog/species/${randomUUID()}/corrections`),
    ).toMatchObject({
      status: 404,
    });
  });
});
