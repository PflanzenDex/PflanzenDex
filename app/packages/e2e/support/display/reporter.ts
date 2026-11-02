/* eslint-disable security/detect-non-literal-fs-filename -- every path is a fixed folder or file of this package or comes from the checked-in register */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { FullConfig, FullResult, Reporter, Suite } from "@playwright/test/reporter";
import { SIZES, type Baseline, type Result } from "./one-screen/judge";
import { buildBaseline, entryOf, judgeBaseline } from "./one-screen/baseline";
import { SCREENS } from "./one-screen/register";

// Playwright reporter of the one-screen gate (issue 1137, QG-U8): after the run it merges the results of all workers,
// writes the table for the job summary, checks the baseline itself and, with ONE_SCREEN_WRITE=1, rewrites the baseline.

const cell = (r: Result | undefined, baseline: Baseline): string => {
  if (!r) return "-";
  const mark = r.failures.length === 0 ? "" : entryOf(baseline, r) ? " (listed)" : " **NEW**";
  if (r.size.startsWith("2560")) return (r.cap > 0 ? `cap +${r.cap} px` : "ok") + mark;
  const f = (n: number) => n.toFixed(2);
  return `${f(r.page)}/${f(r.inner)} \u2194 ${f(r.pageX)}/${f(r.innerX)}${mark}`;
};

/** The table for the job summary: page/inner per screen and size, failures marked. */
function reportMarkdown(results: readonly Result[], baseline: Baseline): string {
  const names = SIZES.map((s) => s.name);
  const lines = [
    "## One screen (US-QS-15, QG-U8)",
    "",
    "Cells show page/inner (height of the content divided by the height of the window or region) and, after the arrow, page/inner sideways (width likewise); all must be at most 1.00 (1 px tolerance).",
    "",
    "| size | measured | failing | listed in the baseline |",
    "| --- | --- | --- | --- |",
  ];
  for (const n of names) {
    const rows = results.filter((r) => r.size === n);
    const failing = rows.filter((r) => r.failures.length > 0);
    const listed = failing.filter((r) => entryOf(baseline, r)).length;
    lines.push(`| ${n} | ${rows.length} | ${failing.length} | ${listed} |`);
  }
  lines.push(
    "",
    `| screen | ${names.join(" | ")} |`,
    `| --- | ${names.map(() => "---").join(" | ")} |`,
  );
  const screens = [...new Set(results.map((r) => r.screen))].sort();
  for (const id of screens) {
    const row = names.map((n) =>
      cell(
        results.find((r) => r.screen === id && r.size === n),
        baseline,
      ),
    );
    lines.push(`| ${id} | ${row.join(" | ")} |`);
  }
  return lines.join("\n") + "\n";
}

export const REPORT_DIR = new URL("../../one-screen-report/", import.meta.url);
export const BASELINE_FILE = new URL(
  "../../../../config/gates/baselines/one-screen-baseline.json",
  import.meta.url,
);

export function readBaseline(): Baseline {
  return JSON.parse(readFileSync(BASELINE_FILE, "utf8")) as Baseline;
}

export function writeBaseline(baseline: Baseline): void {
  writeFileSync(BASELINE_FILE, JSON.stringify(baseline, null, 2) + "\n");
}

export function saveResults(id: string, results: readonly Result[]): void {
  const dir = new URL("results/", REPORT_DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(new URL(`${id}.json`, dir), JSON.stringify(results));
}

const PROJECT = "one-screen";

function readResults(): Result[] {
  const dir = new URL("results/", REPORT_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => JSON.parse(readFileSync(new URL(f, dir), "utf8")) as Result[]);
}

export default class OneScreenReporter implements Reporter {
  private active = false;

  onBegin(_config: FullConfig, suite: Suite): void {
    this.active = suite.suites.some((s) => s.project()?.name === PROJECT);
    if (!this.active) return;
    rmSync(new URL("results/", REPORT_DIR), { recursive: true, force: true });
  }

  async onEnd(result: FullResult): Promise<{ status: FullResult["status"] } | undefined> {
    if (!this.active) return undefined;
    mkdirSync(REPORT_DIR, { recursive: true });
    const results = readResults();
    if (results.length === 0) return undefined; // only the self-test ran
    const complete = results.length === SCREENS.length * SIZES.length;
    if (process.env["ONE_SCREEN_WRITE"] === "1") {
      if (!complete) {
        console.error(
          `one-screen: ${results.length} measurements, not a full run: baseline not written`,
        );
        return { status: "failed" };
      }
      writeBaseline(buildBaseline(results));
      console.log(
        `one-screen: baseline written (${buildBaseline(results).entries.length} entries)`,
      );
    }
    const baseline = readBaseline();
    writeFileSync(new URL("report.md", REPORT_DIR), reportMarkdown(results, baseline));
    writeFileSync(new URL("results.json", REPORT_DIR), JSON.stringify(results));
    const problems = judgeBaseline(
      baseline,
      new Set(SCREENS.map((s) => s.id)),
      new Set(SIZES.map((s) => s.name)),
    );
    for (const p of problems) console.error(`one-screen: ${p} (${BASELINE_FILE.pathname})`);
    return problems.length > 0 && result.status === "passed" ? { status: "failed" } : undefined;
  }
}
