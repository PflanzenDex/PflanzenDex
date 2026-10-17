// Fill the catalog once from open sources (US-BES-12, E-25). Ports only; the adapters (tables for the source snapshots
// DM-BES-05 and the field provenance DM-BES-06) come with the next cut. Foreign requests run only in the job (FR-BES-18).
import type { SourceName } from "../../kernel";

export const FILL_SOURCES = ["gbif", "wikidata", "wikipedia"] as const;
export type FillSource = Extract<SourceName, (typeof FILL_SOURCES)[number]>;

/**
 * License per source as the source states it. Assumption until E-25 is closed: GBIF backbone CC0 1.0, Wikidata CC0 1.0,
 * Wikipedia text CC BY-SA 4.0 (attribution and share-alike apply when the text is shown).
 */
export const SOURCE_LICENSE: Readonly<Record<FillSource, string>> = {
  gbif: "CC0-1.0",
  wikidata: "CC0-1.0",
  wikipedia: "CC-BY-SA-4.0",
};

/** DM-BES-05: the raw answer of one source for one species, kept unchanged so conversions can be repeated. */
export interface SourceSnapshot {
  readonly speciesId: string;
  readonly source: FillSource;
  /** Identifier at the source (GBIF usage key, Wikidata item); `null` when the source has no hit. */
  readonly sourceId: string | null;
  readonly retrievedAt: string;
  readonly link: string;
  readonly license: string;
  /** `null` = the source answered "no hit" (kept, so the job does not ask again, P-08). */
  readonly raw: unknown;
}

/** Catalog fields the open sources can fill; the others stay "unknown" and go to the gap list (US-BES-13). */
export const FILLABLE_FIELDS = ["familyLatin", "germanName", "botanicalStory"] as const;
export type FillableField = (typeof FILLABLE_FIELDS)[number];

/** DM-BES-06: a value with its origin. Origin is always `source` here; the date is the retrieval date. */
export interface FieldValue {
  readonly field: FillableField;
  readonly value: string;
  readonly origin: "source";
  readonly source: FillSource;
  readonly link: string;
  readonly license: string;
  readonly retrievedAt: string;
  /** Another source gave a different value; the first-ranked one was taken (FR-BES-17, US-BES-16). */
  readonly disputed: boolean;
}

/** A species with gaps. Values already set are never overwritten (reviewed values included, FR-BES-19). */
export interface FillCandidate {
  readonly id: string;
  readonly latinName: string;
  readonly empty: readonly FillableField[];
}

export interface CatalogFillStore {
  /** Approved species with at least one empty fillable field and no snapshot of every source yet. */
  candidates(): Promise<readonly FillCandidate[]>;
  /** Stores the snapshots and fills only the still-empty fields in one step (no partial state). */
  record(
    speciesId: string,
    snapshots: readonly SourceSnapshot[],
    values: readonly FieldValue[],
  ): Promise<void>;
}

/** Reads a nested value of a foreign answer without trusting its shape; anything missing is `undefined`. */
export function dig(data: unknown, ...path: readonly (string | number)[]): unknown {
  let node: unknown = data;
  for (const key of path) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string | number, unknown>)[key];
  }
  return node;
}

export const text = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;
