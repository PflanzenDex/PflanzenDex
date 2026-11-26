import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Check } from "./check";
import { cellName, emulatedOf, type Cell } from "./device";

// The record of one cell of a run (US-DEV-01, issue 2504): written by the test as soon as the cell is judged, read by the reporter
// at the end, so a run that stops half way still leaves what it measured. The run folder is `DEVICE_CHECK_RUN_DIR` (set by
// playwright.config.ts): device-check-report/<timestamp>/ under the e2e package, gitignored.

export type CellStatus = "pass" | "fail" | "skipped" | "error";

/** What one cell measured: its status, its checks, the device as measured (model for the real phone) and its screenshots. */
export interface CellRecord {
  key: string;
  cell: Cell;
  status: CellStatus;
  /** Why the cell was skipped, or the error it stopped on (a seed gap, a refused sign-in). */
  reason?: string;
  device: {
    label: string;
    model?: string;
    width: number;
    height: number;
    measuredWidth: number;
    measuredHeight: number;
    rem: number;
  };
  checks: Check[];
  shots: string[];
  ms: number;
}

/** The run folder of this run (DEVICE_CHECK_RUN_DIR). Refused when unset: a cell must never write into an unknown folder. */
export function runDirOf(): string {
  const dir = process.env["DEVICE_CHECK_RUN_DIR"];
  if (!dir)
    throw new Error("device-check: DEVICE_CHECK_RUN_DIR is not set (playwright.config.ts sets it)");
  return dir;
}

/** The folder of the screenshots of a run. */
export function shotsDirOf(runDir: string): string {
  return join(runDir, "shots");
}

/** The folder of the cell records of a run. */
export function cellsDirOf(runDir: string): string {
  return join(runDir, "cells");
}

/** Writes the record of one cell (`cells/<key>.json`). Overwrites a record of the same key from an earlier run of the folder. */
export function writeCell(runDir: string, record: CellRecord): void {
  const dir = cellsDirOf(runDir);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the run folder of this tool
  mkdirSync(dir, { recursive: true });
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the run folder and the cell key are built by this tool
  writeFileSync(join(dir, `${record.key}.json`), JSON.stringify(record, null, 2) + "\n");
}

/** The records of a run, sorted by key; an empty list when the run wrote none (an idle reporter then does nothing). */
export function readCells(runDir: string): CellRecord[] {
  const dir = cellsDirOf(runDir);
  let files: string[];
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- the run folder of this tool
    files = readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .sort();
  } catch {
    return [];
  }
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the cell records of this run
  return files.map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as CellRecord);
}

/** The record of a cell that did not run (a phone that is not there): its reason, no checks; the summary names the skip (P-10). */
export function skippedCell(cell: Cell, reason: string): CellRecord {
  return {
    key: cellName(cell),
    cell,
    status: "skipped",
    reason,
    device: {
      label: "Real phone",
      width: 0,
      height: 0,
      measuredWidth: 0,
      measuredHeight: 0,
      rem: 0,
    },
    checks: [],
    shots: [],
    ms: 0,
  };
}

/** The annotations that name the cells of a test: the reporter writes an error record for a cell whose test ended without one. */
export function cellNotes(cells: readonly Cell[]): { type: string; description: string }[] {
  return cells.map((cell) => ({ type: CELL_NOTE, description: JSON.stringify(cell) }));
}

/** The annotation type of a cell note (the reporter reads it back). */
export const CELL_NOTE = "device-check-cell";

/** The record of a cell whose test ended (a timeout, a crash) before it wrote its own: an error with the test's reason (P-10). */
export function errorCell(cell: Cell, reason: string, ms: number): CellRecord {
  const device = emulatedOf(cell.device);
  return {
    key: cellName(cell),
    cell,
    status: "error",
    reason,
    device: {
      label: device?.label ?? "Real phone",
      width: device?.width ?? 0,
      height: device?.height ?? 0,
      measuredWidth: 0,
      measuredHeight: 0,
      rem: 0,
    },
    checks: [],
    shots: [],
    ms,
  };
}
