/* eslint-disable security/detect-non-literal-fs-filename -- the shard folders are the artifacts of this CI run; the paths come from the arguments and the register */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SCREENS } from "../../../support/display/one-screen/register";
import { SIZES, type Result as OneScreenResult } from "../../../support/display/one-screen/judge";
import { A11Y_SIZES, type Result as A11yResult } from "../../../support/display/a11y/findings";
import {
  REPORT_DIR as ONE_SCREEN_DIR,
  readBaseline as oneScreenBaseline,
  readShiftBaseline,
  reportMarkdown as oneScreenMarkdown,
} from "../../../support/display/reporter";
import {
  SHIFT_SIZES,
  shiftMarkdown,
  type ShiftResult,
} from "../../../support/display/one-screen/judge.shift";
import {
  REPORT_DIR as A11Y_DIR,
  readBaseline as a11yBaseline,
  reportMarkdown as a11yMarkdown,
} from "../../../support/display/a11y/reporter";

// US-QG-01 (issue 1485): the shards of a gate run the screens that the split of register.ts (planShards) gives them, one
// shard per runner. Each shard writes the results of its screens into its own report folder; this CLI merges them into the report of the whole run for the job
// summary and the results.json the baseline is built from. It fails unless every screen and size of the register was
// measured exactly once, so a shard that did not run, or a screen that no shard picked up, turns the gate red.
// `npm run merge-shards -w @pflanzendex/e2e -- <gate> <folder with one folder per shard>` (Makefile: one-screen-merge,
// a11y-routes-merge).

/** One measurement as the reporters write it: every result has a screen and a size. */
export interface Measured {
  screen: string;
  size: string;
}

/**
 * The screen and size pairs that are missing, repeated or not in the register. An empty list means every screen and
 * every size was measured exactly once.
 */
export function coverageProblems(
  measured: readonly Measured[],
  screens: readonly string[],
  sizes: readonly string[],
): string[] {
  const expected = new Set(screens.flatMap((s) => sizes.map((z) => `${s} @ ${z}`)));
  const count = new Map<string, number>();
  for (const m of measured) {
    const key = `${m.screen} @ ${m.size}`;
    count.set(key, (count.get(key) ?? 0) + 1);
  }
  const missing = [...expected].filter((key) => !count.has(key));
  const repeated = [...count].filter(([, n]) => n > 1).map(([key]) => key);
  const unknown = [...count.keys()].filter((key) => !expected.has(key));
  const problems: string[] = [];
  if (missing.length > 0)
    problems.push(`not measured (${missing.length}): ${missing.slice(0, 10).join(", ")}`);
  if (repeated.length > 0)
    problems.push(`measured more than once: ${repeated.slice(0, 10).join(", ")}`);
  if (unknown.length > 0) problems.push(`not in the register: ${unknown.slice(0, 10).join(", ")}`);
  return problems;
}

/** The results.json of every shard: the artifacts are unpacked into one folder per shard, `<folder>/<report>/results.json`. */
export function shardFiles(dir: string, report: string): string[] {
  if (!existsSync(dir)) return [];
  const target = join(report, "results.json");
  return readdirSync(dir, { recursive: true })
    .map(String)
    .filter((path) => path.endsWith(target))
    .map((path) => join(dir, path));
}

/** The layout-shift results of every shard: reporter.ts writes one-screen-report/shift/results/<screen>.json (US-QS-14, #1729). */
export function shiftShardRows(dir: string): ShiftResult[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true })
    .map(String)
    .filter((path) => /(^|\/)one-screen-report\/shift\/results\/[^/]+\.json$/.test(path))
    .flatMap((path) => JSON.parse(readFileSync(join(dir, path), "utf8")) as ShiftResult[]);
}

/** The step summary part of the layout-shift check: reported, not blocking, while its switch is off (#1729). Empty without rows. */
export function shiftSummary(rows: readonly ShiftResult[]): string {
  return rows.length === 0 ? "" : shiftMarkdown(rows, readShiftBaseline());
}

interface Gate {
  dir: URL;
  report: string;
  sizes: readonly string[];
  markdown: (rows: Measured[]) => string;
}

const GATES = new Map<string, Gate>([
  [
    "one-screen",
    {
      dir: ONE_SCREEN_DIR,
      report: "one-screen-report",
      sizes: SIZES.map((s) => s.name),
      markdown: (rows) => oneScreenMarkdown(rows as OneScreenResult[], oneScreenBaseline()),
    },
  ],
  [
    "a11y-routes",
    {
      dir: A11Y_DIR,
      report: "a11y-routes-report",
      sizes: A11Y_SIZES.map((s) => s.name),
      markdown: (rows) => a11yMarkdown(rows as A11yResult[], a11yBaseline()),
    },
  ],
]);

/** Merges the shards of one gate: writes report.md and results.json, prints the proof, returns the exit code. */
export function mergeGate(gate: string, shardsDir: string): number {
  const spec = GATES.get(gate);
  if (!spec) {
    console.error(`usage: merge-shards <${[...GATES.keys()].join("|")}> <folder with the shards>`);
    return 2;
  }
  const files = shardFiles(shardsDir, spec.report);
  if (files.length === 0) {
    console.error(`${gate}: no shard results under ${shardsDir}`);
    return 1;
  }
  const shards = files.map((file) => ({
    file,
    rows: JSON.parse(readFileSync(file, "utf8")) as Measured[],
  }));
  const measured = shards.flatMap((shard) => shard.rows);
  for (const shard of shards)
    console.log(`${gate}: ${shard.file}: ${shard.rows.length} measurements`);
  const screens = SCREENS.map((s) => s.id);
  const problems = coverageProblems(measured, screens, spec.sizes);
  mkdirSync(spec.dir, { recursive: true });
  writeFileSync(new URL("results.json", spec.dir), JSON.stringify(measured));
  const shift = gate === "one-screen" ? shiftShardRows(shardsDir) : [];
  writeFileSync(new URL("report.md", spec.dir), spec.markdown(measured) + shiftSummary(shift));
  const shiftExpected = screens.length * SHIFT_SIZES.length;
  if (gate === "one-screen")
    console.log(
      `${gate}: layout shift ${shift.length} of ${shiftExpected} loads (reported, not blocking)`,
    );
  if (gate === "one-screen" && shift.length !== shiftExpected)
    console.error(
      `${gate}: layout shift: ${shiftExpected - shift.length} loads not measured (reported, not blocking)`,
    );
  const expected = screens.length * spec.sizes.length;
  console.log(`${gate}: ${shards.length} shards, ${measured.length} of ${expected} measurements`);
  for (const problem of problems) console.error(`${gate}: ${problem}`);
  if (problems.length > 0) return 1;
  console.log(`${gate}: every screen and size measured exactly once`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  process.exitCode = mergeGate(process.argv[2] ?? "", process.argv[3] ?? "");
