import { randomUUID } from "node:crypto";
import os from "node:os";
import { Harness, type Counts } from "./harness.ts";
import { seedAccount, seedTaxa } from "./seed.ts";

// Usage: PFLANZENDEX_TEST_DATABASE_URL=postgres://... npm run perf:measure -w @pflanzendex/api
// Environment: PERF_SIZES (default "100,1000"), PERF_RUNS (timed runs per endpoint, default 30), PERF_SPECIES (distinct
// species per account, default 60).
const SIZES = (process.env["PERF_SIZES"] ?? "100,1000").split(",").map(Number);
const RUNS = Number(process.env["PERF_RUNS"] ?? 30);
const TZ = "timeZone=Europe%2FBerlin";
const ENDPOINTS: readonly [screen: string, path: string][] = [
  ["Heute", `/today?${TZ}`],
  ["Heute", "/specimens/hints"],
  ["Sammlung", `/specimens/cards?${TZ}`],
  ["Sammlung", "/specimens"],
  ["Sammlung", "/specimens/count"],
  ["Sammlung", "/specimens/distribution"],
  ["Sammlung", "/specimens/light-overview"],
  ["Sammlung", "/specimens/difficulty"],
  ["Entdecken", `/discover/suggestions?${TZ}&deck=1`],
  ["Entdecken", `/pokedex/cards?${TZ}`],
  ["Entdecken", `/pokedex/ownership?${TZ}`],
  ["Entdecken", "/wishes/candidates"],
  ["Artenliste", "/species?q="],
];

const quantile = (sorted: number[], q: number) =>
  sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)] ?? NaN;

type Row = { size: number; screen: string; path: string; status: number; bytes: number } & {
  median: number;
  p95: number;
  sql: Counts;
};

async function measure(
  h: Harness,
  sub: string,
  size: number,
  [screen, path]: readonly [string, string],
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
    screen,
    path,
    status: last.status,
    bytes: last.bytes,
    median: quantile(times, 0.5),
    p95: quantile(times, 0.95),
    sql: { ...h.counts },
  };
  return row;
}

async function main(): Promise<void> {
  const h = new Harness();
  await h.start();
  const taxa = await seedTaxa(h);
  const rows: Row[] = [];
  for (const size of SIZES) {
    const sub = `perf-${size}-${randomUUID()}`;
    const t0 = Date.now();
    await seedAccount(h, sub, size, String(size));
    await h.admin.query("analyze");
    console.error(`seeded ${size} specimens in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    for (const e of ENDPOINTS) rows.push(await measure(h, sub, size, e));
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
