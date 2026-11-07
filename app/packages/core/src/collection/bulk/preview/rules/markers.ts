// Markers of an import (US-BES-03, DM-BES-03, US-BES-18): the rows of one species are judged in file order, the way
// `planMarkers` judges each create (shared/markers.ts), but with every row of the file in view. Pure.
//
// What `planMarkers` allows, row after row (count = active specimens of the species when the row is created):
// - without a marker only while count is 0 (the first specimen), and never once a third specimen is due (the rule of
//   three: from the third active specimen on every specimen carries a marker, so a row without one is no first specimen);
// - a marker is free: no specimen of the species has it, archived ones included, case-insensitive;
// - the row that makes the third active specimen needs an answer for every active specimen without a marker; the answer
//   is given to a specimen that exists before the import, so an incoming row without a marker cannot be answered at all.
import type { ErrorCode } from "../../../../kernel";
import type { MarkerAnswer } from "../../../shared/markers";
import { ACTIVE_FOR_MARKERS } from "../../types";

/** The specimens of the species that exist before the import (all statuses are counted where a marker is taken). */
export interface ExistingMarkers {
  /** Active specimens of the species. */
  readonly active: number;
  /** Markers the species uses, archived specimens included (their marker stays taken, US-BES-07). */
  readonly taken: readonly string[];
  /** Active specimens without a marker: the answers of the keeper name them (US-BES-03). */
  readonly unmarked: readonly { readonly id: string; readonly name: string }[];
}

/** A row of the file that would be written, in file order (its marker as given, `null` for none). */
export interface IncomingRow {
  readonly line: number;
  readonly marker: string | null;
}

export interface MarkerFlag {
  readonly line: number;
  readonly code: ErrorCode;
  /** For `specimen.markers_missing`: the specimens that still need a marker. */
  readonly missing?: readonly { readonly id: string; readonly name: string }[];
}

interface Progress {
  /** Active specimens when the next row is created. */
  count: number;
  /** Markers in use, lower case. */
  taken: Set<string>;
  /** Existing active specimens without a marker that the answers have not yet given one. */
  unmarkedLeft: number;
}

const lower = (text: string): string => text.toLowerCase();

/** Whether the answers give a marker to every existing active specimen without one. */
const answersCover = (
  unmarked: ExistingMarkers["unmarked"],
  answers: readonly MarkerAnswer[],
): boolean => unmarked.every((u) => answers.some((a) => a.specimenId === u.id));

/** The row that makes the third active specimen: it needs the answers of the existing ones (`specimen.markers_missing`). */
const dueForAnswers = (count: number): boolean => count + 1 >= ACTIVE_FOR_MARKERS;

interface Context {
  readonly existing: ExistingMarkers;
  readonly answers: readonly MarkerAnswer[];
  readonly needsMarkers: boolean;
}

/** A row without a marker where one is due, or with a marker that is taken. */
function ownFlag(row: IncomingRow, progress: Progress, ctx: Context): MarkerFlag | null {
  if (row.marker === null && (ctx.needsMarkers || progress.count > 0))
    return { line: row.line, code: "specimen.marker_required" };
  if (row.marker !== null && progress.taken.has(lower(row.marker)))
    return { line: row.line, code: "specimen.marker_taken" };
  return null;
}

/** The row that makes the third active specimen: the answers must cover the existing ones and not clash with a marker. */
function answerFlag(row: IncomingRow, progress: Progress, ctx: Context): MarkerFlag | null {
  if (!dueForAnswers(progress.count) || progress.unmarkedLeft === 0) return null;
  if (!answersCover(ctx.existing.unmarked, ctx.answers))
    return { line: row.line, code: "specimen.markers_missing", missing: ctx.existing.unmarked };
  const answered = ctx.answers.map((a) => lower(a.marker));
  const clash =
    new Set(answered).size < answered.length ||
    answered.some((m) => progress.taken.has(m) || m === lower(row.marker ?? ""));
  return clash ? { line: row.line, code: "specimen.marker_taken" } : null;
}

function flagFor(row: IncomingRow, progress: Progress, ctx: Context): MarkerFlag | null {
  return ownFlag(row, progress, ctx) ?? answerFlag(row, progress, ctx);
}

function accept(row: IncomingRow, progress: Progress, answers: readonly MarkerAnswer[]): void {
  if (row.marker !== null) progress.taken.add(lower(row.marker));
  if (dueForAnswers(progress.count) && progress.unmarkedLeft > 0) {
    for (const answer of answers) progress.taken.add(lower(answer.marker));
    progress.unmarkedLeft = 0;
  }
  progress.count += 1;
}

/**
 * Judges the rows of one species in file order. Returns one flag per row that could not be written as it stands; the rows
 * without a flag are the ones `planMarkers` accepts when the file is imported, given the answers.
 */
export function judgeMarkers(
  existing: ExistingMarkers,
  rows: readonly IncomingRow[],
  answers: readonly MarkerAnswer[],
): readonly MarkerFlag[] {
  const ctx = {
    existing,
    answers,
    needsMarkers: existing.active + rows.length >= ACTIVE_FOR_MARKERS,
  };
  const progress: Progress = {
    count: existing.active,
    taken: new Set(existing.taken.map(lower)),
    unmarkedLeft: existing.unmarked.length,
  };
  const flags: MarkerFlag[] = [];
  for (const row of rows) {
    const flag = flagFor(row, progress, ctx);
    if (flag) flags.push(flag);
    else accept(row, progress, answers);
  }
  return flags;
}
