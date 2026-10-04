// Species catalog (US-BES-01, DM-BES-01). Ports for persistence; adapters live in `db` (AB-1).
import type { ReviewStatus } from "../types";

export const GROWTH_MEASURES = ["height", "rosette_diameter", "shoot_length"] as const;
export type GrowthMeasure = (typeof GROWTH_MEASURES)[number];

/** Limits are assumptions (starting values), except difficulty 1–3 and default level 2–4 from DM-BES-01. */
export const SPECIES_LIMITS = {
  difficulty: { min: 1, max: 3 },
  standardLevel: { min: 2, max: 4 },
  lightDemandLux: { min: 1, max: 200_000 },
  name: { min: 2, max: 120 },
  short: { min: 1, max: 200 },
  lang: { min: 1, max: 1000 },
  synonyms: 20,
} as const;

export type NameField = "latin" | "german" | "english" | "synonym";

/** A name of the species with a key for search and duplicate check. */
export interface SpeciesName {
  readonly field: NameField;
  readonly display: string;
  readonly norm: string;
}

/** All details the creator provides; `null` means "unknown" (P-08). */
export interface SpeciesValues {
  readonly latinName: string;
  readonly genus: string;
  readonly epithet: string | null;
  readonly cultivar: string | null;
  readonly germanName: string | null;
  readonly englishName: string | null;
  readonly synonyms: readonly string[];
  readonly familyGerman: string | null;
  readonly familyLatin: string | null;
  readonly difficulty: number;
  readonly standardLevel: number;
  readonly lightDemandLux: number;
  /** Month-day `MM-DD`; both or none. */
  readonly dormancyFrom: string | null;
  readonly dormancyUntil: string | null;
  readonly locationHint: string | null;
  readonly growthMeasure: GrowthMeasure;
  readonly etiolationSigns: string;
  readonly wateringHint: string | null;
  readonly substrate: string | null;
  readonly pruning: string | null;
  readonly growthHacks: string | null;
  readonly successCriteria: string;
  readonly botanicalStory: string | null;
  readonly source: string | null;
}

export interface Species extends SpeciesValues {
  readonly id: string;
  readonly reviewStatus: ReviewStatus;
  readonly createdBy: "operator" | "reviewer" | "user";
  /** The caller created the species. */
  readonly own: boolean;
  readonly version: number;
  /** Why a reviewer rejected the proposal; only its creator gets it (FR-BES-11, US-BES-10). */
  readonly reviewReason?: string | null;
}

export interface SpeciesHit extends Species {
  /** What the search matched the species on; `null` for an empty search. */
  readonly hit: { readonly field: NameField; readonly display: string } | null;
}

export type SpeciesCreation = { readonly kind: "fresh" | "duplicate"; readonly value: Species };

/**
 * Persistence port. All calls apply to the account `userId` and return only what it may see
 * (own proposals and approved species, FR-BES-11); the adapter additionally enforces this via row rule.
 */
export interface SpeciesStore {
  /** `norm`: normalized search text, `null` lists all visible species. */
  search(userId: string, norm: string | null): Promise<readonly SpeciesHit[]>;
  find(userId: string, id: string): Promise<Species | null>;
  /** Like `find`, but a reviewer also gets foreign open proposals to judge them (US-BES-10). Others: as `find`. */
  findForReview(userId: string, id: string): Promise<Species | null>;
  /**
   * Checks duplicates among the visible species and creates species, names and review case (`proposal`) in one
   * step (FR-BES-03: no partial state). With a duplicate nothing is written.
   */
  create(
    userId: string,
    values: SpeciesValues,
    names: readonly SpeciesName[],
  ): Promise<SpeciesCreation>;
}
