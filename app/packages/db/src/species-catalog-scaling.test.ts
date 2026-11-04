import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { APPROVED_FACTS, searchQuery } from "./catalog/species/species-read.ts";
import { TEST_OWNER_ROLE } from "./kernel/connection/connection.ts";
import {
  enterApplicationRole,
  migrate,
  openAdminPool,
  openPool,
  REQUEST_LIMITS,
  testDatabaseUrl,
  testOwnerUrl,
} from "./kernel/index.ts";

// NFR-12, issue #1249 (US-QG-07): the species reads must not grow with the size of the shared catalog. Issue #1235 made
// the visibility of a species a stored column; this gate keeps the reads from paying per catalog row again. It seeds a
// catalog of 100 species and the same catalog plus 1,900 species the viewer cannot see (other accounts' private
// proposals, rejected and merged ones), runs every read as the application role for the viewer, and fails when the
// large catalog costs more than FACTOR times the small one. The rows must be the same at both sizes.
//
// Metric: function calls per statement (pg_stat_user_functions with track_functions = all). Rejected candidates, with
// the numbers in docs/records/test-logs/nfr-12.md, section 13: shared buffer hits (a sequential scan of the catalog
// table grows with the table, so the healthy code would fail), and subplan loops (they grow with the names the search
// scans, which is the accepted linear scan, and they do not see a policy function, so the old per-row policy passes).
//
// Limit of the metric: a statement whose own predicates already filter the viewer's rows (the list and the Pokedex
// facts) calls a policy function only for the rows it returns, so the old per-row policy stays flat there. The search
// reads `species_name` before its own filter and shows the policy cost; see the self-test below.
//
// Real PostgreSQL, a scratch database owned by the non-superuser owner role (row security applies, as in production).
// Deterministic: no timing, fixed data, ANALYZE after every seed.

const SMALL = 100;
const LARGE = 2_000;
// Starting value, an assumption (not measured on a real catalog): a read may cost this factor more at LARGE species.
const FACTOR = 2;
const VIEWER_DESCRIPTION =
  "the viewer sees 50 approved species and 10 of its own proposals in both catalogs";

// Row rules before migration 0102 (NFR-12, #1235): `visible` called species_status() for every row (0012, on species and
// on species_name), `reviewer_reads` called is_open_proposal() (0017). Applied only inside the self-test's transaction,
// which is rolled back, never committed.
const PRE_0102_POLICY = `
  drop policy visible on species;
  create policy visible on species for select using (species_status(id) is not null);
  drop policy reviewer_reads on species;
  create policy reviewer_reads on species for select using (is_reviewer() and is_open_proposal(id));
  drop policy visible on species_name;
  create policy visible on species_name for select using (species_status(species_id) is not null);
  drop policy reviewer_reads on species_name;
  create policy reviewer_reads on species_name for select using (is_reviewer() and is_open_proposal(species_id));`;

// The reads of the API, as the adapters run them: the list and the search (`searchQuery`, the text of
// `SpeciesPostgres.search`) and the Pokedex facts (`APPROVED_FACTS`, the text of `SpeciesPostgres.approvedFacts`).
interface Read {
  readonly name: string;
  readonly text: string;
  readonly values: readonly unknown[];
}
const READS: readonly Read[] = [
  { name: "species list", ...searchQuery(null) },
  { name: 'species search (term "gatea")', ...searchQuery("gatea") },
  { name: 'species search (term "gatea 1")', ...searchQuery("gatea 1") },
  { name: "Pokedex facts (approved species)", text: APPROVED_FACTS, values: [] },
];

interface Measurement {
  readonly rows: readonly unknown[];
  readonly calls: number;
  readonly functions: Readonly<Record<string, number>>;
}
type Run = Record<string, Measurement>;

// Seeding. Index i of a range is the species `md5('gate-species-' || i)`. Its name spreads over the alphabet: 7919 is
// coprime to LARGE, so the names are unique and their order does not follow the index.
const ID = "md5('gate-species-' || i)::uuid";
const NAME = `'Gatea ' || lpad(((i * 7919) % ${LARGE})::text, 4, '0')`;
type Kind = "approved" | "own" | "foreign" | "rejected" | "merged";
interface Accounts {
  readonly viewer: string;
  readonly other: string;
  readonly operator: string;
}

/** A range of species of one kind, bulk inserted: one statement per table; the reviewer context is the operator's. */
async function seedRange(
  c: PoolClient,
  from: number,
  to: number,
  kind: Kind,
  who: Accounts,
): Promise<void> {
  const creator = kind === "approved" ? who.operator : kind === "own" ? who.viewer : who.other;
  const status = kind === "approved" ? "curated" : "proposal";
  const range = [from, to];
  await c.query(
    `insert into review_case (account_id, object_kind, object_id, status)
     select $3::uuid, 'species', ${ID}, $4 from generate_series($1::int, $2::int) i`,
    [...range, creator, status],
  );
  await c.query(
    `insert into species (id, genus, latin_name, difficulty, standard_level, light_demand_lux, growth_measure,
       etiolation_signs, success_criteria, created_by)
     select ${ID}, 'Gatea', ${NAME}, 1, 2, 100, 'height', 'v', 'e', 'user' from generate_series($1::int, $2::int) i`,
    range,
  );
  await c.query(
    `insert into species_name (species_id, field, display, norm)
     select ${ID}, 'latin', ${NAME}, lower(${NAME}) from generate_series($1::int, $2::int) i`,
    range,
  );
  if (kind === "rejected")
    await c.query(
      `update review_case set status = 'rejected', reason = 'Doppelt'
        where object_kind = 'species' and object_id in (select ${ID} from generate_series($1::int, $2::int) i)`,
      range,
    );
  if (kind === "merged")
    await c.query(
      `update review_case set status = 'merged', merged_into = md5('gate-species-1')::uuid
        where object_kind = 'species' and object_id in (select ${ID} from generate_series($1::int, $2::int) i)`,
      range,
    );
}

/** The small catalog: indexes 1 to 100. The large one adds 101 to LARGE, none of them visible to the viewer. */
const SMALL_CATALOG: readonly (readonly [number, number, Kind])[] = [
  [1, 50, "approved"],
  [51, 60, "own"],
  [61, 100, "foreign"],
];
const EXTRA_CATALOG: readonly (readonly [number, number, Kind])[] = [
  [101, 1_600, "foreign"],
  [1_601, 1_800, "rejected"],
  [1_801, LARGE, "merged"],
];

// Measurement. `track_functions` is a superuser setting, so the measuring session is the superuser's; each read switches
// to the application role (row security applies), as `withAccount` does.
async function functionCalls(c: PoolClient): Promise<Map<string, number>> {
  await c.query("select pg_stat_force_next_flush()");
  await c.query("select pg_stat_clear_snapshot()");
  const r = await c.query<{ name: string; calls: string }>(
    `select schemaname || '.' || funcname as name, calls from pg_stat_user_functions where schemaname = 'public'`,
  );
  return new Map(r.rows.map((row) => [row.name, Number(row.calls)]));
}

/**
 * One read as `viewer`, in a transaction that is rolled back; the optional `policy` runs inside it. The function calls
 * are the difference of the cumulative counters before and after the read, flushed by the same session.
 */
async function measure(
  c: PoolClient,
  viewer: string,
  read: Read,
  policy: string | null,
): Promise<Measurement> {
  const before = await functionCalls(c);
  await c.query("begin");
  let rows: readonly unknown[];
  try {
    if (policy) await c.query(policy);
    await enterApplicationRole(c, REQUEST_LIMITS, [["app.account_id", viewer]]);
    rows = (await c.query(read.text, [...read.values])).rows;
  } finally {
    await c.query("rollback");
  }
  const after = await functionCalls(c);
  const functions: Record<string, number> = {};
  for (const [name, calls] of after) {
    const delta = calls - (before.get(name) ?? 0);
    if (delta !== 0) functions[name] = delta;
  }
  const calls = Object.values(functions).reduce((sum, n) => sum + n, 0);
  return { rows, calls, functions };
}

async function measureAll(c: PoolClient, viewer: string, policy: string | null): Promise<Run> {
  const run: Run = {};
  for (const read of READS) run[read.name] = await measure(c, viewer, read, policy);
  return run;
}

/** The measurement of one read in a run; every read is measured in every run, so a missing one is a broken test. */
function measurementOf(run: Run, name: string): Measurement {
  const m = run[name];
  if (!m) throw new Error(`no measurement of "${name}"`);
  return m;
}

/**
 * The verdict for one read: the rows must be the same at both sizes, and the large catalog must not cost more than
 * FACTOR times the small one. A read may call one function per statement (the reviewer check runs once), so the base is
 * at least one call: such a constant never fails the gate.
 */
function gateFailures(name: string, small: Measurement, large: Measurement): string[] {
  if (JSON.stringify(small.rows) !== JSON.stringify(large.rows))
    return [
      `species read "${name}": the ${SMALL} and the ${LARGE} species catalog return different rows (the comparison needs the same rows)`,
    ];
  const base = Math.max(small.calls, 1);
  if (large.calls <= FACTOR * base) return [];
  const per = Object.entries(large.functions)
    .map(([fn, n]) => `${fn} ${n}`)
    .join(", ");
  return [
    `NFR-12 (#1235, US-QG-07): species read "${name}" grows with the shared catalog. Metric: function calls per statement ` +
      `(pg_stat_user_functions, track_functions = all). ${SMALL} species: ${small.calls} calls, ${LARGE} species: ` +
      `${large.calls} calls, factor ${(large.calls / base).toFixed(1)}x (limit ${FACTOR}x). Functions at ${LARGE} species: ` +
      `${per || "none"}. A lookup per catalog row is the usual cause; see docs/records/test-logs/nfr-12.md, section 13.`,
  ];
}

const withDatabase = (base: string, database: string): string => {
  const url = new URL(base);
  url.pathname = `/${database}`;
  return url.toString();
};

const scratchName = `catalog_scaling_${randomUUID()
  .replace(/[0-9-]/g, "")
  .slice(0, 8)}`;
const accounts: Accounts = { viewer: randomUUID(), other: randomUUID(), operator: randomUUID() };
const results: Record<"new" | "old", Record<"small" | "large", Run>> = {
  new: { small: {}, large: {} },
  old: { small: {}, large: {} },
};
let admin: Pool | undefined;
let superuser: Pool | undefined;

async function seedAndMeasure(client: PoolClient): Promise<void> {
  await client.query("set track_functions = 'all'");
  // The seed runs in the reviewer context: approved species and the decisions need an operator.
  await client.query("select set_config('app.account_id', $1, false)", [accounts.operator]);
  for (const id of [accounts.viewer, accounts.other, accounts.operator])
    await client.query("insert into account (id) values ($1)", [id]);
  await client.query("insert into account_role (account, role) values ($1, 'operator')", [
    accounts.operator,
  ]);
  const analyze = "analyze species; analyze species_name; analyze review_case";

  for (const [from, to, kind] of SMALL_CATALOG) await seedRange(client, from, to, kind, accounts);
  await client.query(analyze);
  results.new.small = await measureAll(client, accounts.viewer, null);
  results.old.small = await measureAll(client, accounts.viewer, PRE_0102_POLICY);

  for (const [from, to, kind] of EXTRA_CATALOG) await seedRange(client, from, to, kind, accounts);
  await client.query(analyze);
  results.new.large = await measureAll(client, accounts.viewer, null);
  results.old.large = await measureAll(client, accounts.viewer, PRE_0102_POLICY);
}

beforeAll(async () => {
  const server = openAdminPool();
  admin = server;
  await server.query(`create database ${scratchName} owner ${TEST_OWNER_ROLE}`);
  const owner = openPool(withDatabase(testOwnerUrl(), scratchName));
  try {
    await migrate(owner);
  } finally {
    await owner.end();
  }
  const pool = openPool(withDatabase(testDatabaseUrl(), scratchName));
  superuser = pool;
  const client = await pool.connect();
  try {
    await seedAndMeasure(client);
  } finally {
    client.release();
  }
}, 120_000);

afterAll(async () => {
  await superuser?.end();
  if (admin) {
    await admin.query(`drop database if exists ${scratchName} with (force)`);
    await admin.end();
  }
}, 60_000);

describe("NFR-12 US-QG-07 species reads do not grow with the shared catalog (issue #1249)", () => {
  it("NFR-12 US-QG-07 each read returns the same, non-empty rows at 100 and at 2,000 species", () => {
    for (const read of READS) {
      const small = measurementOf(results.new.small, read.name).rows;
      const large = measurementOf(results.new.large, read.name).rows;
      expect(large, `${read.name}: ${VIEWER_DESCRIPTION}`).toEqual(small);
      expect(large.length, read.name).toBeGreaterThan(0);
    }
  });

  it("NFR-12 US-QG-07 the species list, search and Pokedex reads cost the same at 100 and 2,000 species", () => {
    const failures = READS.flatMap((read) =>
      gateFailures(
        read.name,
        measurementOf(results.new.small, read.name),
        measurementOf(results.new.large, read.name),
      ),
    );
    expect(failures.join("\n")).toBe("");
  });

  it("NFR-12 US-QG-07 the gate fails with the pre-0102 per-row policy: the species search costs per catalog row", () => {
    // The self-test runs the old policy on the same data, inside a rolled-back transaction (see the header).
    const searches = READS.filter((read) => read.name.startsWith("species search"));
    const failures = searches.flatMap((read) =>
      gateFailures(
        read.name,
        measurementOf(results.old.small, read.name),
        measurementOf(results.old.large, read.name),
      ),
    );
    expect(failures).toHaveLength(searches.length);
    for (const failure of failures) {
      expect(failure).toMatch(/^NFR-12 \(#1235, US-QG-07\): species read "species search/);
      expect(failure).toMatch(/function calls per statement/);
      expect(failure).toMatch(/100 species: \d+ calls, 2000 species: \d+ calls/);
      expect(failure).toMatch(/limit 2x/);
      expect(failure).toMatch(/species_status \d+/);
    }
  });

  it("NFR-12 US-QG-07 the pre-0102 policy returns the same rows as the current one: only the cost differs", () => {
    for (const read of READS) {
      expect(measurementOf(results.old.small, read.name).rows).toEqual(
        measurementOf(results.new.small, read.name).rows,
      );
      expect(measurementOf(results.old.large, read.name).rows).toEqual(
        measurementOf(results.new.large, read.name).rows,
      );
    }
  });

  it("NFR-12 US-QG-07 the self-test leaves no policy behind: the species policy is the column predicate again", async () => {
    const r = await superuser?.query<{ qual: string }>(
      "select qual from pg_policies where tablename = 'species' and policyname = 'visible'",
    );
    expect(r?.rows[0]?.qual).toMatch(/review_status/);
    expect(r?.rows[0]?.qual).not.toMatch(/species_status/);
  });
});
