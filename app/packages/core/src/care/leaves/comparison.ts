// The comparison of the newest leaf with an earlier one (US-WAC-07, P-08). Pure: no I/O, no clock; the leaves come in
// as the store sends them. Length and width are compared only with the same measure, never with each other.
import type { LeafRow } from "./types";

export type LeafMeasure = "length" | "width";
export type LeafDirection = "larger" | "smaller" | "same";

export interface LeafComparison {
  readonly measure: LeafMeasure;
  readonly direction: LeafDirection;
}

/** The field of a leaf that holds each measure (millimetres). */
const FIELD = { length: "lengthMm", width: "widthMm" } as const;

/** Oldest first: by date, with the same date the leaf created earlier. */
const byCreation = (a: LeafRow, b: LeafRow): number =>
  a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt);

/** The newest leaf against the last earlier leaf that has the same measure; `null` when that gives no pair. */
function against(
  newest: LeafRow,
  earlier: readonly LeafRow[],
  measure: LeafMeasure,
): LeafComparison | null {
  const field = FIELD[measure];
  const current = newest[field];
  if (current === null) return null;
  // `earlier` is newest first, so the first match is the last earlier leaf with this measure.
  const last = earlier.find((leaf) => leaf[field] !== null);
  if (!last) return null;
  const previous = last[field] as number;
  const direction: LeafDirection =
    current > previous ? "larger" : current < previous ? "smaller" : "same";
  return { measure, direction };
}

/**
 * The comparison shown for a plant (US-WAC-07): the newest leaf (latest date, a tie is the leaf created last) against the
 * last earlier leaf with a length. Without that pair the same is done with the width. Without a pair at all `null`:
 * nothing is compared, the plant shows no comparison (P-08).
 */
export function compareLeaves(leaves: readonly LeafRow[]): LeafComparison | null {
  const ordered = [...leaves].sort(byCreation);
  const newest = ordered.at(-1);
  if (!newest) return null;
  const earlier = ordered.slice(0, -1).reverse();
  return against(newest, earlier, "length") ?? against(newest, earlier, "width");
}
