import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter";
import {
  CELL_NOTE,
  cellsDirOf,
  errorCell,
  readCells,
  writeCell,
  type CellRecord,
} from "./report.cells";
import type { Cell } from "./device";
import { cellName } from "./device";
import { countsOf, rowOf, summaryJson, summaryMarkdown, type RunMeta } from "./report.render";

// Playwright reporter of the device check (US-DEV-01, issue 2504): after the run it reads the cell records of the run folder,
// writes summary.json and summary.md into it, and prints the table and the path. Idle when the run wrote no cell (the other
// gates, which share the config), so `make one-screen` and `make a11y-routes` print nothing from here.

const FILTER_VARS = [
  "DEVICE_CHECK_SCREEN",
  "DEVICE_CHECK_FLOW",
  "DEVICE_CHECK_DEVICE",
  "DEVICE_CHECK_THEME",
  "DEVICE_CHECK_TEXT",
  "DEVICE_CHECK_FORCED",
] as const;

/** The filters of the run as the user wrote them (blank ones are "all"), one line. */
function filtersLine(): string {
  const set = FILTER_VARS.filter((v) => (process.env[v] ?? "").trim() !== "").map(
    (v) => `${v.replace("DEVICE_CHECK_", "")}=${process.env[v]}`,
  );
  return set.length ? set.join(" ") : "defaults";
}

/** The phone as the run met it: its model and window, or the reason it was not used; "not asked" without phone cells. */
function phoneLineOf(records: readonly CellRecord[]): string {
  const phone = records.filter((r) => r.cell.device === "phone");
  if (phone.length === 0) return "not asked";
  const measured = phone.find((r) => r.device.model);
  if (measured)
    return `${measured.device.model}, window ${measured.device.measuredWidth} x ${measured.device.measuredHeight} px`;
  const first = phone[0];
  return first ? `${first.status}${first.reason ? `: ${first.reason}` : ""}` : "no phone attached";
}

/** What the summary says is not checked: the limits of the tool, every run. */
const NOTES = [
  "TalkBack and other screen readers are checked by hand (accessibility-check skill); the tool checks focus and announcements, not speech.",
  "The real phone runs only on this devbox, over adb; it is never part of CI (no phone there).",
  "The emulated devices run in the pinned browser container with a 1-pixel tolerance; a difference of one rendering to another is not a finding.",
];

/** Writes the summary of a run folder and prints its table; returns the summary path (empty when the run wrote no cell). */
export function writeSummary(runDir: string, startedAt: string): string {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the run folder of this tool
  if (!existsSync(cellsDirOf(runDir))) return "";
  const records = readCells(runDir);
  const meta: RunMeta = {
    startedAt,
    filters: filtersLine(),
    phone: phoneLineOf(records),
    notes: NOTES,
  };
  const json = join(runDir, "summary.json");
  const md = join(runDir, "summary.md");
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the summary files of the run folder
  writeFileSync(json, summaryJson(records, meta));
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the summary files of the run folder
  writeFileSync(md, summaryMarkdown(records, meta));
  const counts = countsOf(records);
  const lines = [
    "",
    `device-check: ${records.length} cells, pass ${counts.pass}, fail ${counts.fail}, error ${counts.error}, skipped ${counts.skipped}`,
    `device-check: phone: ${meta.phone}`,
    ...records.map((r) => `device-check: ${rowOf(r)}`),
    `device-check: summary ${md}`,
    `device-check: summary (JSON) ${json}`,
    "",
  ];
  console.log(lines.join("\n"));
  return md;
}

class DeviceCheckReporter implements Reporter {
  private startedAt = new Date().toISOString();

  // A test that failed, timed out or crashed before its cells wrote their records: each of its cells gets an error record with the
  // test's reason, so the summary keeps every cell of the run (P-10).
  onTestEnd(test: TestCase, result: TestResult): void {
    const runDir = process.env["DEVICE_CHECK_RUN_DIR"];
    if (!runDir || result.status === "passed" || result.status === "skipped") return;
    const reason = (result.errors[0]?.message ?? `${result.status}`).split("\n")[0] ?? "";
    for (const note of test.annotations.filter((a) => a.type === CELL_NOTE)) {
      const cell = JSON.parse(note.description ?? "null") as Cell;
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- the cell records of the run folder
      if (existsSync(join(cellsDirOf(runDir), `${cellName(cell)}.json`))) continue;
      writeCell(runDir, errorCell(cell, reason, result.duration));
    }
  }

  onEnd(): void {
    const runDir = process.env["DEVICE_CHECK_RUN_DIR"];
    if (!runDir) return;
    writeSummary(runDir, this.startedAt);
  }
}

export default DeviceCheckReporter;
