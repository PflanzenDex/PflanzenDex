/* eslint-disable security/detect-non-literal-fs-filename -- every path is a fixed folder or file of this package or comes from the checked-in register */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { FullConfig, FullResult, Reporter, Suite } from "@playwright/test/reporter";
import { SCREENS } from "../one-screen/register";
import {
  A11Y_SIZES,
  buildBaseline,
  judgeBaseline,
  type Baseline,
  type Finding,
  type Result,
} from "./findings";

// Playwright reporter of the accessibility gate per route (FR-QG-24, QG-U7, issue 467): after the run it merges the results
// of all workers into results.json (the CI artifact the baseline is rebuilt from), writes the table for the job summary,
// checks the baseline itself and, with A11Y_ROUTES_WRITE=1, rewrites the baseline.

export const REPORT_DIR = new URL("../../../a11y-routes-report/", import.meta.url);
export const BASELINE_FILE = new URL(
  "../../../../../config/gates/baselines/a11y-routes-baseline.json",
  import.meta.url,
);

export const readBaseline = (): Baseline =>
  JSON.parse(readFileSync(BASELINE_FILE, "utf8")) as Baseline;

export const writeBaseline = (baseline: Baseline): void =>
  writeFileSync(BASELINE_FILE, JSON.stringify(baseline, null, 2) + "\n");

export function saveResults(id: string, results: readonly Result[]): void {
  const dir = new URL("results/", REPORT_DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(new URL(`${id}.json`, dir), JSON.stringify(results));
}

function readResults(): Result[] {
  const dir = new URL("results/", REPORT_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => JSON.parse(readFileSync(new URL(f, dir), "utf8")) as Result[]);
}

const EXPECTED = SCREENS.length * A11Y_SIZES.length;

const countOf = (findings: readonly Finding[], kind: Finding["kind"]) =>
  findings.filter((f) => f.kind === kind).reduce((sum, f) => sum + f.count, 0);

/** The tables for the job summary: elements per rule and size, then per screen and size. */
function reportMarkdown(results: readonly Result[], baseline: Baseline): string {
  const sizes = A11Y_SIZES.map((s) => s.name);
  const lines = [
    "## Accessibility per route (FR-QG-24, QG-U7)",
    "",
    `Baseline: ${baseline.entries.length} entries. Cells show axe/keyboard elements; the rule tables below name them.`,
    "",
  ];
  for (const size of sizes) {
    const rows = results.filter((r) => r.size === size).flatMap((r) => r.findings);
    const rules = [...new Set(rows.map((f) => `${f.kind} ${f.rule}`))].sort();
    lines.push(`### ${size}`, "", "| rule | screens | elements |", "| --- | --- | --- |");
    for (const rule of rules) {
      const hit = results.filter(
        (r) => r.size === size && r.findings.some((f) => `${f.kind} ${f.rule}` === rule),
      );
      const n = hit.flatMap((r) => r.findings.filter((f) => `${f.kind} ${f.rule}` === rule));
      lines.push(`| ${rule} | ${hit.length} | ${n.reduce((s, f) => s + f.count, 0)} |`);
    }
    lines.push("");
  }
  lines.push(
    `| screen | ${sizes.join(" | ")} |`,
    `| --- | ${sizes.map(() => "---").join(" | ")} |`,
  );
  for (const id of [...new Set(results.map((r) => r.screen))].sort()) {
    const cells = sizes.map((s) => {
      const f = results.find((r) => r.screen === id && r.size === s)?.findings ?? [];
      return f.length === 0 ? "ok" : `${countOf(f, "axe")}/${countOf(f, "keyboard")}`;
    });
    lines.push(`| ${id} | ${cells.join(" | ")} |`);
  }
  return lines.join("\n") + "\n";
}

const PROJECT = "a11y-routes";

export default class A11yRoutesReporter implements Reporter {
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
    if (process.env["A11Y_ROUTES_WRITE"] === "1") {
      if (results.length !== EXPECTED) {
        console.error(
          `a11y-routes: ${results.length} of ${EXPECTED} measurements: baseline not written`,
        );
        return { status: "failed" };
      }
      writeBaseline(buildBaseline(results));
      console.log(
        `a11y-routes: baseline written (${buildBaseline(results).entries.length} entries)`,
      );
    }
    const baseline = readBaseline();
    writeFileSync(new URL("report.md", REPORT_DIR), reportMarkdown(results, baseline));
    writeFileSync(new URL("results.json", REPORT_DIR), JSON.stringify(results));
    const problems = judgeBaseline(
      baseline,
      new Set(SCREENS.map((s) => s.id)),
      new Set(A11Y_SIZES.map((s) => s.name)),
    );
    for (const p of problems) console.error(`a11y-routes: ${p} (${BASELINE_FILE.pathname})`);
    return problems.length > 0 && result.status === "passed" ? { status: "failed" } : undefined;
  }
}
