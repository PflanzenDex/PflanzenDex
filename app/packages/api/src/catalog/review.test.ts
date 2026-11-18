import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createFileDatabase,
  migrate,
  openAdminPool,
  openFixturePool,
  openOwnerPool,
  openPool,
} from "@pflanzendex/db";
import { createApp, type AppOptions } from "../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-BES-10 over HTTP with real PostgreSQL (`make db-up`): two plant keepers and an operator share the catalog.
// The file runs in a database of its own (`createFileDatabase`, as query-count.test.ts, #1301). A run that was killed
// before its teardown leaves its open proposals in the shared test database; `GET /review` lists every open proposal of
// that database and gets slower with each one (issue 1659: 506 leftovers, the list test timed out at 5 s). In a database
// of its own only this run's rows exist, so a leftover cannot change the result or the time. The databases of killed runs
// are dropped at the start, while the run lock is held. A second run of this file at the same time fails with a message.
let pool: Pool;
let admin: Pool; // superuser fixture pool of the file's database: setup and cross-tenant observation (QG-D1)
let database: Awaited<ReturnType<typeof createFileDatabase>> | undefined;
// A session lock on the test database: it ends with its connection, so a killed run does not keep it (issue 1659).
const RUN_LOCK = "hashtext('pflanzendex-review-file-run')";
const DATABASE_PREFIX = "pflanzendex_review";
let lockPool: Pool | undefined;
let runLock: PoolClient | undefined;
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

// A request that does not answer within this bound fails with its name, instead of letting vitest stop the test at its
// 5 s timeout with no cause (issue 1659). Assumption: starting value, below that timeout.
const ANSWER_LIMIT_MS = 4_000;

async function call(
  sub: string | null,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (sub) headers["authorization"] = `Bearer valid:${sub}`;
  headers["idempotency-key"] = randomUUID();
  const answer = app.request(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unanswered = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${method} ${path} did not answer within ${ANSWER_LIMIT_MS} ms`)),
      ANSWER_LIMIT_MS,
    );
  });
  try {
    const res = await Promise.race([answer, unanswered]);
    return { status: res.status, body: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
  } finally {
    clearTimeout(timer);
  }
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
  // Named failure instead of a TypeError on `undefined` (issue 1659): the proposal must be in the reviewer's list.
  if (!entry)
    throw new Error(`proposal ${r.body["id"]} is not in the review list (${list.status})`);
  return { speciesId: r.body["id"] as string, caseId: entry.reviewCase.id as string };
};
const approve = async (sub: string) => {
  const p = await propose(sub);
  expect(
    (await call(subOperator, "POST", `/review/${p.caseId}/decide`, { status: "reviewed" })).status,
  ).toBe(200);
  return p;
};

/** Drops the databases that earlier runs of this file left behind (killed before their `afterAll`). Call it under the run lock. */
async function dropEarlierRunDatabases(superuser: Pool): Promise<void> {
  const left = await superuser.query<{ datname: string }>(
    "select datname from pg_database where starts_with(datname, $1)",
    [`${DATABASE_PREFIX}_`],
  );
  for (const { datname } of left.rows)
    await superuser.query(`drop database if exists "${datname}" with (force)`);
}

beforeAll(async () => {
  lockPool = openAdminPool(true);
  const lock = await lockPool.connect();
  runLock = lock;
  const taken = await lock.query<{ got: boolean }>(
    `select pg_try_advisory_lock(${RUN_LOCK}) as got`,
  );
  if (taken.rows[0]?.got !== true)
    throw new Error(
      "review.test.ts: another run of this file is active on the test database; stop it or wait for it (US-QG-02, issue 1659)",
    );
  await dropEarlierRunDatabases(lockPool);
  database = await createFileDatabase(DATABASE_PREFIX);
  pool = openPool(database.ownerUrl);
  admin = openPool(database.fixtureUrl, true);
  await migrate(pool);
  app = createApp({ reviewer: verifier, pool });
  for (const sub of [subKeeper, subOther, subOperator]) await call(sub, "GET", "/species");
  await admin.query(
    "insert into account_role (account, role) select id, 'operator' from account where subject = $1",
    [subOperator],
  );
}, 60_000);
afterAll(async () => {
  try {
    if (database) {
      await pool.end();
      await admin.end();
    }
  } finally {
    try {
      await database?.drop();
    } finally {
      runLock?.release();
      await lockPool?.end();
    }
  }
}, 60_000);

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

describe("US-BES-10 an approval refuses a Latin name that an approved species has", () => {
  it("US-BES-10 approving such a proposal answers 409 review.name_approved with the species; nothing changes", async () => {
    const latinName = `Twinus ${run}${"q".repeat(++counter)}`;
    const first = await propose(subKeeper, { latinName });
    const second = await propose(subOther, { latinName });
    expect(
      (await call(subOperator, "POST", `/review/${first.caseId}/decide`, { status: "reviewed" }))
        .status,
    ).toBe(200);
    const refused = await call(subOperator, "POST", `/review/${second.caseId}/decide`, {
      status: "reviewed",
    });
    expect(refused).toMatchObject({
      status: 409,
      body: {
        error: {
          code: "review.name_approved",
          data: { existing: { id: first.speciesId, latinName } },
        },
      },
    });
    const list = await call(subOperator, "GET", "/review");
    expect(
      list.body["entries"].find(
        (e: { reviewCase: { id: string } }) => e.reviewCase.id === second.caseId,
      ),
    ).toMatchObject({
      reviewCase: { status: "proposal" },
      issues: [{ field: "latinName", reason: "name_approved" }],
    });
  });

  it("US-BES-10 the review list carries the duplicates of approved Latin names for reviewers", async () => {
    const list = await call(subOperator, "GET", "/review");
    expect(Array.isArray(list.body["duplicates"])).toBe(true);
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

/**
 * Writes an open proposal into the shared test database, the database that earlier runs wrote to, as a killed run leaves
 * it: no account, the case open (issue 1659). Returns the case id. Superuser, so the write skips the guards of a real run.
 */
async function leaveOpenProposal(speciesId: string): Promise<string> {
  const owner = openOwnerPool();
  try {
    await migrate(owner); // the shared database has its schema once any file has run; idempotent otherwise
  } finally {
    await owner.end();
  }
  const shared = openFixturePool();
  const client = await shared.connect();
  try {
    await client.query("begin");
    await client.query("set local session_replication_role = replica");
    await client.query(
      `insert into species (id, genus, epithet, latin_name, created_by, review_status, source,
         difficulty, standard_level, light_demand_lux, growth_measure, etiolation_signs, success_criteria)
       values ($1, 'Leftover', $2, $3, 'user', 'proposal', 'RHS', 2, 3, 40000, 'rosette_diameter',
         'Rosette streckt sich.', 'Dichte.')`,
      [speciesId, run, `Leftover ${run}`],
    );
    const inserted = await client.query<{ id: string }>(
      `insert into review_case (object_kind, object_id, status) values ('species', $1, 'proposal') returning id`,
      [speciesId],
    );
    await client.query("commit");
    const caseId = inserted.rows[0]?.id;
    if (!caseId) throw new Error(`no review case written for the leftover ${speciesId}`);
    return caseId;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await shared.end();
  }
}

/** Removes what `leaveOpenProposal` wrote, so the shared database is as it was. */
async function removeLeftover(speciesId: string): Promise<void> {
  const shared = openFixturePool();
  const client = await shared.connect();
  try {
    await client.query("begin");
    await client.query("set local session_replication_role = replica");
    await client.query("delete from review_case where object_kind = 'species' and object_id = $1", [
      speciesId,
    ]);
    await client.query("delete from species where id = $1", [speciesId]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await shared.end();
  }
}

describe("US-QG-02 rows that an earlier run left (issue 1659)", () => {
  it("US-QG-02 an open proposal that an earlier run left in the shared test database is not in this run's review list", async () => {
    const leftover = randomUUID();
    const leftoverCase = await leaveOpenProposal(leftover);
    try {
      const list = await call(subOperator, "GET", "/review");
      expect(list.status).toBe(200);
      expect(
        list.body["entries"].map((e: { reviewCase: { id: string } }) => e.reviewCase.id),
      ).not.toContain(leftoverCase);
      const open = await admin.query<{ n: string }>(
        "select count(*) as n from review_case where status in ('proposal', 'ai_unreviewed')",
      );
      expect(list.body["open"]).toBe(Number(open.rows[0]?.n));
    } finally {
      await removeLeftover(leftover);
    }
  });
});
