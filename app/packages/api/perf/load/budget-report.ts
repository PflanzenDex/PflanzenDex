import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Nightly load measurement (NFR-12, FR-QG-09, issue 1250): compares the result of measure.ts with the budgets in
// config/gates/quality-limits.json (`perf`, the only source of the budgets) and writes a Markdown table for the job
// summary. Report only (owner decision 2026-11-05): a route past its budget is listed, never fails the run, until the
// owner switches `perf.blocking` on through its own gate PR. A measurement that is broken (no rows, a route that does not
// answer 200, a missing budget size) always fails, so a silent gap cannot pass as green (P-10).
// Usage: npx tsx perf/load/budget-report.ts <measure.json>   (exit 1: broken, or past a budget while blocking)

export type Budget = { maxMedianMs: number; maxP95Ms: number; maxBodyKb: number };
export type PerfLimits = {
  /** The seeded size (specimens) whose rows are compared with the budgets. */
  size: number;
  blocking: boolean;
  default: Budget;
  /** Budgets per route pattern, over `default`. */
  routes?: Record<string, Partial<Budget>>;
};
type Row = {
  size: number;
  screen: string;
  pattern: string;
  status: number;
  bytes: number;
  median: number;
  p95: number;
  sql: { total: number; payload: number };
};
export type Measurement = {
  date: string;
  cpu?: string;
  cores?: number;
  runs: number;
  skipped?: { pattern: string; reason: string }[];
  rows: Row[];
};
export type Report = { markdown: string; over: string[]; broken: string[] };

const LIMITS_FILE = new URL("../../../../config/gates/quality-limits.json", import.meta.url);

export function readLimits(file: URL | string = LIMITS_FILE): PerfLimits {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the limits file of the repo, or a test file
  const perf = (JSON.parse(readFileSync(file, "utf8")) as { perf?: PerfLimits }).perf;
  if (!perf) throw new Error("quality-limits.json has no `perf` block");
  return perf;
}

const kb = (bytes: number) => bytes / 1024;
const ms = (x: number) => x.toFixed(1);

/** The budget of one route: its own values over the default. */
export const budgetOf = (limits: PerfLimits, pattern: string): Budget => ({
  ...limits.default,
  ...limits.routes?.[pattern],
});

/** What a row exceeds, as short texts; empty when it is within its budget. */
export function overruns(row: Row, budget: Budget): string[] {
  const out: string[] = [];
  if (row.median > budget.maxMedianMs)
    out.push(`median ${ms(row.median)} > ${budget.maxMedianMs} ms`);
  if (row.p95 > budget.maxP95Ms) out.push(`p95 ${ms(row.p95)} > ${budget.maxP95Ms} ms`);
  if (kb(row.bytes) > budget.maxBodyKb)
    out.push(`body ${kb(row.bytes).toFixed(1)} > ${budget.maxBodyKb} KB`);
  return out;
}

export function report(data: Measurement, limits: PerfLimits): Report {
  const rows = data.rows.filter((r) => r.size === limits.size);
  const broken: string[] = [];
  if (rows.length === 0) broken.push(`no rows at ${limits.size} specimens`);
  for (const r of rows) if (r.status !== 200) broken.push(`${r.pattern} answered ${r.status}`);
  const over: string[] = [];
  const lines = [
    `### Load measurement at ${limits.size} specimens (NFR-12, ${limits.blocking ? "blocking" : "report only"})`,
    "",
    `${data.date}, ${data.cpu ?? "unknown CPU"} (${data.cores ?? "?"} cores), ${data.runs} timed runs per route, in process against PostgreSQL in CI. Budgets: \`perf\` in quality-limits.json (starting values, assumption).`,
    "",
    "| Screen | Route | Status | Median ms | p95 ms | Statements | Body KB | Budget (median / p95 / KB) | Verdict |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const r of [...rows].sort((a, b) => b.median - a.median)) {
    const budget = budgetOf(limits, r.pattern);
    const past = overruns(r, budget);
    if (past.length > 0) over.push(`${r.pattern}: ${past.join(", ")}`);
    const verdict =
      r.status !== 200 ? "broken" : past.length > 0 ? `over: ${past.join(", ")}` : "ok";
    lines.push(
      `| ${r.screen || "-"} | \`${r.pattern}\` | ${r.status} | ${ms(r.median)} | ${ms(r.p95)} | ${r.sql.total} | ${kb(r.bytes).toFixed(1)} | ${budget.maxMedianMs} / ${budget.maxP95Ms} / ${budget.maxBodyKb} | ${verdict} |`,
    );
  }
  lines.push("", `Over budget: ${over.length} of ${rows.length} routes. Broken: ${broken.length}.`);
  for (const s of data.skipped ?? []) lines.push(`- Not measured: \`${s.pattern}\` (${s.reason})`);
  for (const b of broken) lines.push(`- Broken: ${b}`);
  return { markdown: `${lines.join("\n")}\n`, over, broken };
}

/** Exit code: 1 when the measurement is broken, or when a route is past its budget and the budgets block. */
export const exitCode = (r: Report, limits: PerfLimits): number =>
  r.broken.length > 0 || (limits.blocking && r.over.length > 0) ? 1 : 0;

function main(): void {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: budget-report.ts <measure.json>");
    process.exit(2);
  }
  const limits = readLimits();
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the operator names the measurement file on purpose
  const r = report(JSON.parse(readFileSync(file, "utf8")) as Measurement, limits);
  process.stdout.write(r.markdown);
  process.exit(exitCode(r, limits));
}

// Run as a script (not when the test imports it).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
