// The answer of the import preview (US-BES-18): one row per line of the file in file order, the counts, the locations the
// import would create and the markers the keeper still has to give. Pure.
import { normalizeName } from "../../../kernel";
import type { Draft } from "./draft";
import { speciesIdOf } from "./draft";
import type { MarkerRequest, Plan } from "./plan";
import { displayName, type LocationMatch, type Reason, type SpeciesMatch } from "./rules";

export type RowState = "ready" | "flagged" | "already_there" | "skipped";

/** One row of the answer: what the row says, what it would write and why it is flagged (P-09, P-10). */
export interface PreviewRow {
  readonly line: number;
  readonly state: RowState;
  readonly species: {
    readonly name: string;
    /** The species the row names when exactly one matches exactly, or the keeper chose it; `null` otherwise. */
    readonly id: string | null;
    readonly candidates: readonly { readonly id: string; readonly name: string }[];
    /** More species match than `candidates` lists (FR-BES-24). */
    readonly more: boolean;
  };
  readonly nickname: string | null;
  readonly marker: string | null;
  /** The specimen name it would get (DM-BES-03); `null` without a known species, and for a skipped row. */
  readonly specimenName: string | null;
  readonly location: LocationMatch | null;
  readonly catchDate: string | null;
  readonly notes: string | null;
  readonly reasons: readonly Reason[];
}

export interface ImportPreview {
  readonly rows: readonly PreviewRow[];
  readonly counts: {
    readonly ready: number;
    readonly flagged: number;
    readonly alreadyThere: number;
    /** Rows the keeper skipped; they leave the plan and count toward no marker (US-BES-18). */
    readonly skipped: number;
  };
  /** Locations the import would create on confirmation, once each, in their first spelling. */
  readonly newLocations: readonly string[];
  /** Existing specimens that need a marker before the file can be imported (US-BES-03). */
  readonly markers: readonly MarkerRequest[];
}

const candidatesOf = (match: SpeciesMatch) =>
  match.kind === "candidates"
    ? {
        candidates: match.candidates.map((c) => ({ id: c.id, name: displayName(c) })),
        more: match.more,
      }
    : { candidates: [], more: false };

/** A row of the answer. An already existing specimen shows only that reason (it is skipped on confirmation). */
function rowOf(draft: Draft, reasons: readonly Reason[]): PreviewRow {
  const state: RowState = draft.already
    ? "already_there"
    : reasons.length === 0
      ? "ready"
      : "flagged";
  return {
    line: draft.row.line,
    state,
    species: { name: draft.row.species, id: speciesIdOf(draft), ...candidatesOf(draft.match) },
    nickname: draft.row.nickname,
    marker: draft.values.marker,
    specimenName: draft.name,
    location: draft.values.location,
    catchDate: draft.values.catchDate,
    notes: draft.values.notes,
    reasons: draft.already ? [{ code: "specimen.name_taken", field: "species" }] : reasons,
  };
}

/** A skipped row: what the file says about it, and no check of it (the keeper left it out). */
function skippedRowOf(draft: Draft): PreviewRow {
  return {
    line: draft.row.line,
    state: "skipped",
    species: { name: draft.row.species, id: null, candidates: [], more: false },
    nickname: draft.row.nickname,
    marker: null,
    specimenName: null,
    location: null,
    catchDate: null,
    notes: null,
    reasons: [],
  };
}

/** The locations the rows would create, once per normalized name, in their first spelling. */
function newLocationsOf(drafts: readonly Draft[]): string[] {
  const first = new Map<string, string>();
  for (const d of drafts) {
    const location = d.values.location;
    if (location?.isNew && !d.already && !first.has(normalizeName(location.name)))
      first.set(normalizeName(location.name), location.name);
  }
  return [...first.values()];
}

/**
 * The answer for the whole file. `drafts` holds every row in file order; the rows of `skipped` are shown as skipped and
 * their drafts count toward no location and no marker (the plan saw only the other drafts).
 */
export function assemble(
  drafts: readonly Draft[],
  skipped: ReadonlySet<number>,
  plan: Plan,
): ImportPreview {
  const rows = drafts.map((d): PreviewRow =>
    skipped.has(d.row.line) ? skippedRowOf(d) : rowOf(d, plan.reasons.get(d.row.line) ?? d.reasons),
  );
  const count = (state: RowState) => rows.filter((r) => r.state === state).length;
  const written = drafts.filter((d) => !skipped.has(d.row.line));
  return {
    rows,
    counts: {
      ready: count("ready"),
      flagged: count("flagged"),
      alreadyThere: count("already_there"),
      skipped: count("skipped"),
    },
    newLocations: newLocationsOf(written),
    markers: plan.markers,
  };
}
