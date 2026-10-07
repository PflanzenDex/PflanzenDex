// Taxonomy tree of the Pokédex (US-POK-03): built by a background job, never written by hand (FR-POK-03). Every value
// names its source (P-08); what no source gave stays `null` and is shown as "unbekannt".
import type { ErrorCode, Provenance } from "../../kernel";

/** Order, family and genus of a species from OpenTree; `order` and `family` are `null` when the lineage has none. */
export interface TaxonLineage {
  readonly ottId: number;
  /** Current name; differs from the catalog name for a renamed genus (Sansevieria -> Dracaena). */
  readonly acceptedName: string;
  readonly genus: string;
  readonly family: string | null;
  readonly order: string | null;
  readonly provenance: Provenance;
}

/** Wikipedia summary (de, else en: text and image then both come from the English article). */
export interface TaxonText {
  readonly language: "de" | "en";
  /** At most 2 sentences and 240 characters at a sentence boundary; `null` when no such text exists. */
  readonly text: string | null;
  readonly imageUrl: string | null;
  readonly pageUrl: string;
  readonly provenance: Provenance;
}

export interface GenusCount {
  readonly value: number;
  readonly provenance: Provenance;
}

export interface Taxon {
  /** Name as the catalog writes it: the key of the row. */
  readonly latinName: string;
  readonly lineage: TaxonLineage;
  readonly text: TaxonText | null;
  /** Accepted species of the genus (GBIF); `null` also for a count of 0 (= unknown). */
  readonly genusSpeciesCount: GenusCount | null;
}

export type FailureReason = Extract<
  ErrorCode,
  "taxonomy.no_match" | "taxonomy.not_species" | "taxonomy.lineage_missing"
>;

/** A species that could not be resolved: listed with its reason, never dropped silently (P-10). */
export interface TaxonFailure {
  readonly latinName: string;
  readonly reason: FailureReason;
}

export interface TaxonomyBuild {
  /** Fingerprint of the catalog names the build came from; equal fingerprint = nothing to do. */
  readonly fingerprint: string;
  readonly builtAt: string;
  readonly taxa: readonly Taxon[];
  readonly failures: readonly TaxonFailure[];
}

/** The tree is replaced as a whole and atomically: after a failed build the previous good tree stays (US-POK-03). */
export interface TaxonomyStore {
  /** Fingerprint of the stored tree; `null` when there is none yet. */
  fingerprint(): Promise<string | null>;
  replace(build: TaxonomyBuild): Promise<void>;
}

/** Latin species names of the approved catalog (cultivars and species without epithet excluded). */
export interface CatalogNames {
  latinNames(): Promise<readonly string[]>;
}

/** Reads a path out of unknown JSON; `undefined` when any step is missing. */
export function dig(data: unknown, ...path: readonly (string | number)[]): unknown {
  let node: unknown = data;
  for (const key of path) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string | number, unknown>)[key];
  }
  return node;
}

export const asText = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v : null;
