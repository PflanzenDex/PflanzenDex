// Naming rule DM-BES-03 and markers (US-BES-03): which specimens of a species must get a marker before a new one is
// saved. Pure rules on the specimens of one species; the operations decide what to write.
import { appError, isId, type AppError, type ErrorDetail } from "../kernel";
import { specimenName } from "./name";
import { SPECIMEN_LIMITS, isActive } from "./types";
import type { MarkerAssignment, SpecimenRow } from "./types";

/** An answer to "markers missing": the marker an existing specimen shall get (assumption: 100 answers at most). */
export interface MarkerAnswer {
  readonly specimenId: string;
  readonly marker: string;
}
const MAX_ANSWERS = 100;

const invalid: ErrorDetail = { field: "markers", code: "input.invalid" };

function answerOf(item: unknown): MarkerAnswer | null {
  const entry = (item ?? {}) as { specimenId?: unknown; marker?: unknown };
  const marker = typeof entry.marker === "string" ? entry.marker.trim() : "";
  const { min, max } = SPECIMEN_LIMITS.marker;
  const id = entry.specimenId;
  if (!isId(id) || marker.length < min || marker.length > max) return null;
  return { specimenId: id.toLowerCase(), marker };
}

/** Schema field for the optional list of answers; missing means "no answers". */
export function markerAnswersField(value: unknown): readonly MarkerAnswer[] | ErrorDetail {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_ANSWERS) return invalid;
  const answers = (value as unknown[]).map(answerOf);
  return answers.every((a) => a !== null) ? answers : invalid;
}

const same = (a: string | null, b: string) => a !== null && a.toLowerCase() === b.toLowerCase();

/** Is the marker used by a specimen of the species, archived ones included (their marker stays taken, US-BES-07)? */
export const markerTaken = (siblings: readonly SpecimenRow[], marker: string): boolean =>
  siblings.some((z) => same(z.marker, marker));

export type MarkerPlan =
  | { readonly kind: "ok"; readonly assignments: readonly MarkerAssignment[] }
  | { readonly kind: "failed"; readonly error: AppError };

const done = (assignments: readonly MarkerAssignment[] = []): MarkerPlan => ({
  kind: "ok",
  assignments,
});
const fail = (error: AppError): MarkerPlan => ({ kind: "failed", error });
const brief = (z: SpecimenRow) => ({ id: z.id, name: z.name });

/**
 * Applies DM-BES-03 to a new specimen of a species whose specimens are `siblings` (all statuses). From the third
 * active specimen on every active specimen has a marker; archived ones do not count and are never renamed.
 * - Without a marker the new specimen is only possible as the first one; otherwise a marker is required.
 * - The marker is unique per species, case-insensitive.
 * - If the new one is the 3rd (or later) active specimen, the active ones without a marker need an answer each.
 */
export function planMarkers(args: {
  speciesName: string;
  marker: string | null;
  answers: readonly MarkerAnswer[];
  siblings: readonly SpecimenRow[];
}): MarkerPlan {
  const { speciesName, marker, answers, siblings } = args;
  const active = siblings.filter(isActive);
  if (marker === null) {
    if (active.length === 0) return done();
    const name = specimenName(speciesName, null);
    const data = { name, existing: siblings.map(brief) };
    return fail(appError("specimen.marker_required", { data }));
  }
  if (markerTaken(siblings, marker)) return fail(appError("specimen.marker_taken"));
  const missing = active.length + 1 >= 3 ? active.filter((z) => z.marker === null) : [];
  if (answers.some((a) => !missing.some((z) => z.id === a.specimenId)))
    return fail(appError("specimen.not_found"));
  const open = missing.filter((z) => !answers.some((a) => a.specimenId === z.id));
  if (open.length > 0)
    return fail(appError("specimen.markers_missing", { data: { missing: open.map(brief) } }));
  const chosen = [marker, ...answers.map((a) => a.marker)].map((m) => m.toLowerCase());
  if (new Set(chosen).size < chosen.length || answers.some((a) => markerTaken(siblings, a.marker)))
    return fail(appError("specimen.marker_taken"));
  return done(
    answers.map((a) => ({
      specimenId: a.specimenId,
      marker: a.marker,
      name: specimenName(speciesName, a.marker),
    })),
  );
}
