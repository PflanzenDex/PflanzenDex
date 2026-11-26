import { failing } from "./check";
import type { CellRecord } from "./report.cells";

// The summary of a run (US-DEV-01, issue 2504): summary.json for the agents and the tools, summary.md for the reader. Pure: the
// records in, the text out. The table has one row per cell and names every failing check with its measured value.

/** What the run was asked for and what the phone reported (null when no phone was attached or asked for). */
export interface RunMeta {
  startedAt: string;
  /** The filters as the user wrote them, one line. */
  filters: string;
  /** "no phone attached" or the phone's model and viewport, one line. */
  phone: string;
  /** What was not checked and why (the real phone and TalkBack limits are printed by the usage doc, not here). */
  notes: string[];
}

const label = (r: CellRecord): string => (r.cell.kind === "flow" ? `flow ${r.cell.id}` : r.cell.id);

/** One table row of a cell: what it is, where, its status, and the failing checks by name. */
export function rowOf(r: CellRecord): string {
  const where = `${r.device.label}${r.device.model ? ` (${r.device.model})` : ""}`;
  const failed = failing(r.checks).map((c) => c.name);
  const reason = r.reason ? ` ${r.reason}` : "";
  const because = failed.length ? ` ${failed.join("; ")}` : "";
  return `${label(r)} | ${where} | ${r.cell.theme} | ${r.cell.text} % | ${r.status}${because}${reason}`;
}

/** Counts of the statuses of a run. */
export function countsOf(records: readonly CellRecord[]): Record<CellRecord["status"], number> {
  const counts = { pass: 0, fail: 0, skipped: 0, error: 0 };
  for (const r of records) counts[r.status] += 1;
  return counts;
}

/** The summary as JSON: the meta, the counts and every record, with the checks and screenshots as measured. */
export function summaryJson(records: readonly CellRecord[], meta: RunMeta): string {
  return JSON.stringify({ ...meta, counts: countsOf(records), cells: records }, null, 2) + "\n";
}

/** The summary as Markdown: the run's settings, the counts, the table and the failing checks in full. */
export function summaryMarkdown(records: readonly CellRecord[], meta: RunMeta): string {
  const counts = countsOf(records);
  const lines = [
    "# Device check",
    "",
    `Run ${meta.startedAt}. Filters: ${meta.filters}.`,
    `Phone: ${meta.phone}.`,
    "",
    `Cells: ${records.length}; pass ${counts.pass}, fail ${counts.fail}, error ${counts.error}, skipped ${counts.skipped}.`,
    "",
    "| screen or flow | device | theme | text | status | failing checks |",
    "| --- | --- | --- | --- | --- | --- |",
    ...records.map((r) => {
      const where = `${r.device.label}${r.device.model ? ` (${r.device.model})` : ""}, ${r.device.measuredWidth}x${r.device.measuredHeight}`;
      const failed = failing(r.checks).map((c) => `${c.name}: ${c.detail ?? c.measured}`);
      const cause = [...failed, ...(r.reason ? [r.reason] : [])].join("; ");
      return `| ${label(r)} | ${where} | ${r.cell.theme} | ${r.cell.text} % | ${r.status} | ${cause.replace(/\|/g, "/")} |`;
    }),
    "",
    "## Screenshots",
    "",
    ...records.flatMap((r) => r.shots.map((s) => `- ${s}`)),
    "",
  ];
  if (meta.notes.length) lines.push("## Not checked", "", ...meta.notes.map((n) => `- ${n}`), "");
  return lines.join("\n");
}

/** Why a cell failed, for the test message: its error or skip reason, else its failing checks with their measured values. */
export function failureOf(r: CellRecord): string {
  if (r.reason) return r.reason;
  return r.checks
    .filter((c) => !c.ok)
    .map((c) => `${c.name} (${c.measured}${c.detail ? `: ${c.detail}` : ""})`)
    .join("; ");
}
