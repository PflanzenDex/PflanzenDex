import os from "node:os";
import { openPool, poolConfigFromEnv, testOwnerUrl } from "@pflanzendex/db";
import { Harness } from "../harness.ts";
import { assertSeeded, seedAccount } from "../seed.ts";

// Concurrency measurement (NFR-12, issue #1242): the Heute screen (`/today` and `/specimens/hints`, one after the other)
// for several virtual users at the same time, in process, on a real PostgreSQL. One screen = both requests; latency is
// measured per screen. Not a test and not a gate; run it with `npm run perf:concurrency -w @pflanzendex/api`.
// The pool is the production pool (`openPool` with `poolConfigFromEnv`): PFLANZENDEX_DB_POOL_MAX sets its size.
// Environment: PERF_USERS (levels, default "1,4,8,16,32"), PERF_SECONDS (per level, default 10), PERF_SIZE (specimens
// per account, default 100), PERF_WARMUP (seconds before the first level, default 2). One account per virtual user,
// seeded once and reused by later runs.

const TZ = "timeZone=Europe%2FBerlin";
const SCREEN = [`/today?${TZ}`, "/specimens/hints"] as const;
const LEVELS = (process.env["PERF_USERS"] ?? "1,4,8,16,32").split(",").map(Number);
const SECONDS = Number(process.env["PERF_SECONDS"] ?? 10);
const SIZE = Number(process.env["PERF_SIZE"] ?? 100);
const WARMUP = Number(process.env["PERF_WARMUP"] ?? 2);

const quantile = (sorted: number[], q: number) =>
  sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)] ?? NaN;

type Level = { users: number; screens: number; perSecond: number; median: number; p95: number };

/** `users` virtual users loop over the screen for `seconds`; each user keeps to its own account (round robin). */
async function runLevel(h: Harness, subs: readonly string[], users: number, seconds: number) {
  const latencies: number[] = [];
  const end = performance.now() + seconds * 1000;
  const started = performance.now();
  await Promise.all(
    Array.from({ length: users }, async (_, u) => {
      const sub = subs[u % subs.length] as string;
      while (performance.now() < end) {
        const t0 = performance.now();
        for (const path of SCREEN) {
          const reply = await h.call(sub, "GET", path);
          if (reply.status !== 200)
            throw new Error(`${path} answered ${reply.status}: ${JSON.stringify(reply.body)}`);
        }
        latencies.push(performance.now() - t0);
      }
    }),
  );
  const elapsed = (performance.now() - started) / 1000;
  latencies.sort((a, b) => a - b);
  const level: Level = {
    users,
    screens: latencies.length,
    perSecond: latencies.length / elapsed,
    median: quantile(latencies, 0.5),
    p95: quantile(latencies, 0.95),
  };
  return level;
}

async function main(): Promise<void> {
  const config = poolConfigFromEnv(process.env);
  const h = new Harness(openPool(testOwnerUrl(), false, config));
  await h.start();
  const users = Math.max(...LEVELS);
  const subs = Array.from({ length: users }, (_, i) => `concurrency-${SIZE}-${i}`);
  for (const [i, sub] of subs.entries()) {
    try {
      await assertSeeded(h, sub, SIZE);
    } catch {
      const t0 = Date.now();
      await seedAccount(h, sub, SIZE, `c${i}`);
      console.error(`seeded ${sub} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    }
  }
  await h.admin.query("analyze");
  await runLevel(h, subs, 4, WARMUP);
  const levels: Level[] = [];
  for (const n of LEVELS) levels.push(await runLevel(h, subs, n, SECONDS));
  const f = (x: number) => x.toFixed(1).padStart(9);
  console.log(
    `pool=${config.max} specimens=${SIZE} seconds=${SECONDS} accounts=${users} cpu="${os.cpus()[0]?.model}" cores=${os.cpus().length} node=${process.version} date=${new Date().toISOString()}`,
  );
  console.log("users  screens/s    median ms     p95 ms   screens");
  for (const l of levels)
    console.log(
      `${String(l.users).padStart(5)} ${f(l.perSecond)} ${f(l.median)} ${f(l.p95)} ${String(l.screens).padStart(9)}`,
    );
  await h.stop();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
