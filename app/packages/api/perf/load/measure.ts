import { randomUUID } from "node:crypto";
import os from "node:os";
import { MEASURED, requestPath } from "../../src/query-count-endpoints.ts";
import { Harness, type Counts } from "../harness.ts";
import { seedAccount, seedTaxa } from "../seed.ts";

// Usage: PFLANZENDEX_TEST_DATABASE_URL=postgres://... npm run perf:measure -w @pflanzendex/api > measure.json
// Environment: PERF_SIZES (default "100,1000"), PERF_RUNS (timed runs per endpoint, default 30), PERF_SPECIES (distinct
// species per account, default 60). The nightly runs it at 1,000 specimens and compares the result with the budgets in
// config/gates/quality-limits.json (`perf`, budget-report.ts; NFR-12, issue 1250).
//
// Every GET route the query-count gate measures (US-QG-07, `MEASURED`) is measured here too, so a new route is covered
// without a second list. Routes that need a friend are skipped with the reason: the perf seed has one keeper only.
const SIZES = (process.env["PERF_SIZES"] ?? "100,1000").split(",").map(Number);
const RUNS = Number(process.env["PERF_RUNS"] ?? 30);

/** The screen a route belongs to, for the main routes of each screen; the others are listed without a screen. */
const SCREENS: Record<string, string> = {
  "/onboarding/unlocks": "Alle Seiten",
  "/today": "Heute",
  "/specimens/hints": "Heute",
  "/specimens/cards": "Sammlung",
  "/specimens/cards/summary": "Sammlung",
  "/specimens": "Sammlung",
  "/specimens/count": "Sammlung",
  "/specimens/distribution": "Sammlung",
  "/specimens/light-overview": "Sammlung",
  "/specimens/difficulty": "Sammlung",
  "/discover/suggestions": "Entdecken",
  "/pokedex/cards": "Entdecken",
  "/pokedex/ownership": "Entdecken",
  "/wishes/candidates": "Entdecken",
  "/species": "Artenliste",
};

/** A route the seed cannot answer, with the reason (shown in the report, P-10). */
const SKIPPED: Record<string, string> = {
  "/friends/:id/collection": "needs a friend; the perf seed has one keeper only",
  "/friends/:id/shared": "needs a friend; the perf seed has one keeper only",
  "/equipment/friends/:id": "needs a friend; the perf seed has one keeper only",
  "/catalog/species/:speciesId/corrections":
    "needs an approved catalog species; the perf seed's species are the keeper's own proposals (404)",
};

const quantile = (sorted: number[], q: number) =>
  sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)] ?? NaN;

type Row = {
  size: number;
  screen: string;
  pattern: string;
  path: string;
  status: number;
  bytes: number;
  median: number;
  p95: number;
  sql: Counts;
};

async function measure(
  h: Harness,
  sub: string,
  size: number,
  [pattern, path]: readonly [pattern: string, path: string],
) {
  for (let i = 0; i < 3; i++) await h.call(sub, "GET", path); // warm-up: plans, connections, JIT
  const times: number[] = [];
  let last = await h.call(sub, "GET", path);
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now();
    last = await h.call(sub, "GET", path);
    times.push(performance.now() - t0);
  }
  h.counts = { total: 0, payload: 0 };
  await h.call(sub, "GET", path); // one extra request only to count its statements
  times.sort((a, b) => a - b);
  const row: Row = {
    size,
    screen: SCREENS[pattern] ?? "",
    pattern,
    path,
    status: last.status,
    bytes: last.bytes,
    median: quantile(times, 0.5),
    p95: quantile(times, 0.95),
    sql: { ...h.counts },
  };
  return row;
}

/** A specimen and its species of the seeded keeper, for the routes with a path parameter. */
async function seededIds(h: Harness, sub: string) {
  const { rows } = await h.admin.query<{ specimen: string; species: string }>(
    `select s.id as specimen, s.species_id as species from specimen s
       join account a on a.id = s.account_id where a.subject = $1 order by s.created_at limit 1`,
    [sub],
  );
  const first = rows[0];
  if (!first) throw new Error(`no seeded specimen for ${sub}`);
  return { specimen: first.specimen, species: first.species, friend: "" };
}

async function main(): Promise<void> {
  const h = new Harness();
  await h.start();
  const taxa = await seedTaxa(h);
  const rows: Row[] = [];
  const patterns = Object.keys(MEASURED).filter((p) => !(p in SKIPPED));
  for (const size of SIZES) {
    const sub = `perf-${size}-${randomUUID()}`;
    const t0 = Date.now();
    await seedAccount(h, sub, size, String(size));
    await h.admin.query("analyze");
    console.error(`seeded ${size} specimens in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    const ids = await seededIds(h, sub);
    for (const pattern of patterns)
      rows.push(await measure(h, sub, size, [pattern, requestPath(pattern, ids)]));
  }
  console.log(
    JSON.stringify(
      {
        date: new Date().toISOString(),
        node: process.version,
        cpu: os.cpus()[0]?.model,
        cores: os.cpus().length,
        runs: RUNS,
        taxa,
        skipped: Object.entries(SKIPPED).map(([pattern, reason]) => ({ pattern, reason })),
        rows,
      },
      null,
      1,
    ),
  );
  await h.stop();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
