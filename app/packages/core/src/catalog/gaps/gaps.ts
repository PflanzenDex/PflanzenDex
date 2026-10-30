// Gap list of the catalog (US-BES-13): which approved species still have which fields "unknown", when and where a
// source was last asked, and what to do next. A read over the shared catalog, so a plain function (no write, P-03).
import { appError, failed, ok, type Result } from "../../kernel";
import { FILLABLE_FIELDS, type FillSource } from "../sources";
import type { ReviewStore } from "../types";

/**
 * Catalog fields that may be unknown ("unbekannt", P-08). The others are required on creation (DM-BES-01). Difficulty,
 * default level and lux demand may be unknown since #1003, growth measure, etiolation signs and success criteria since
 * #1005: no open source fills them, so their next step is research.
 */
export const GAP_FIELDS = [
  "difficulty",
  "standardLevel",
  "lightDemandLux",
  "germanName",
  "englishName",
  "familyGerman",
  "familyLatin",
  "dormancy",
  "locationHint",
  "wateringHint",
  "substrate",
  "pruning",
  "growthHacks",
  "botanicalStory",
  "growthMeasure",
  "etiolationSigns",
  "successCriteria",
] as const;
export type GapField = (typeof GAP_FIELDS)[number];

/**
 * - `fill_job`: an open source can fill it and has not been asked yet (the catalog fill job, US-BES-12).
 * - `research`: the sources were asked and did not fill it (or none covers it): an AI client researches it and hands
 *   it in with a source as an unreviewed draft (US-BES-13), or the operator enters it.
 */
export type GapNextStep = "fill_job" | "research";

/** The last time a source was asked for the species (DM-BES-05). */
export interface GapCheck {
  readonly source: FillSource;
  /** ISO timestamp (UTC). */
  readonly retrievedAt: string;
}

/** What the store returns per approved species: the values (`null` = unknown) and its source snapshots. */
export interface GapSpecies {
  readonly id: string;
  readonly latinName: string;
  readonly values: Readonly<Record<GapField, string | number | null>>;
  readonly checks: readonly GapCheck[];
}

export interface GapEntry {
  readonly field: GapField;
  readonly nextStep: GapNextStep;
}

export interface GapSpeciesEntry {
  readonly id: string;
  readonly latinName: string;
  /** Unknown fields, each with its next step (P-09). Never empty. */
  readonly gaps: readonly GapEntry[];
  /** The most recent check by any source; `null` = no source was asked yet. */
  readonly lastCheck: GapCheck | null;
}

export interface GapList {
  /** Number of species with at least one gap. */
  readonly species: number;
  /** Number of unknown fields over all species. */
  readonly gaps: number;
  readonly entries: readonly GapSpeciesEntry[];
}

export interface GapStore {
  /** Approved, visible species with their values and source snapshots, ordered by Latin name. */
  approvedSpecies(userId: string): Promise<readonly GapSpecies[]>;
}

const FILLABLE: readonly string[] = FILLABLE_FIELDS;
// Wikidata is asked only when the article names an item, so a species is "fully asked" with these two (as the fill job).
const ALWAYS_ASKED: readonly FillSource[] = ["gbif", "wikipedia"];

/** Pure: the gap list of the given species. Nothing is estimated; a species without gaps is left out. */
export function buildGapList(species: readonly GapSpecies[]): GapList {
  const entries: GapSpeciesEntry[] = [];
  for (const s of species) {
    const asked = new Set(s.checks.map((c) => c.source));
    const askedAll = ALWAYS_ASKED.every((src) => asked.has(src));
    const gaps = GAP_FIELDS.filter((f) => s.values[f] === null).map((field) => ({
      field,
      nextStep: (FILLABLE.includes(field) && !askedAll ? "fill_job" : "research") as GapNextStep,
    }));
    if (gaps.length === 0) continue;
    const lastCheck = s.checks.reduce<GapCheck | null>(
      (a, c) => (a === null || c.retrievedAt > a.retrievedAt ? c : a),
      null,
    );
    entries.push({ id: s.id, latinName: s.latinName, gaps, lastCheck });
  }
  return {
    species: entries.length,
    gaps: entries.reduce((n, e) => n + e.gaps.length, 0),
    entries,
  };
}

/** The gap list for the operator and reviewers (the shared catalog, never an account's own data, P-04/P-05). */
export async function catalogGaps(
  gaps: GapStore,
  roles: ReviewStore,
  userId: string | null,
): Promise<Result<GapList>> {
  if (userId === null) return failed(appError("access.not_signed_in"));
  if ((await roles.roles(userId)).length === 0) return failed(appError("access.denied"));
  return ok(buildGapList(await gaps.approvedSpecies(userId)));
}
