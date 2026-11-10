// The read model of the collector cards (US-POK-01, FR-POK-13): the resolved rows of the taxonomy tree in the shape the
// core reads, and the rule that drops a rarity value without its source (P-08). `TaxonomyPostgres.tree` runs `CARDS`.
// Shared by all accounts: no user data.
export type IucnCategory = "LC" | "NT" | "VU" | "EN" | "CR" | "EW" | "EX" | "DD";

/** One resolved species of the tree for the collector cards (US-POK-01); same shape as `TaxonCardRow` in `core`. */
export interface TaxonCardRecord {
  readonly latinName: string;
  readonly genus: string;
  readonly family: string | null;
  readonly order: string | null;
  readonly summary: string | null;
  readonly summaryLanguage: "de" | "en" | null;
  readonly imageUrl: string | null;
  readonly pageUrl: string | null;
  readonly genusSpeciesCount: number | null;
  readonly natureRarity: {
    readonly iucn: {
      readonly category: IucnCategory;
      readonly url: string;
      readonly retrievedAt: string;
    } | null;
    readonly occurrences: {
      readonly count: number;
      readonly url: string;
      readonly retrievedAt: string;
    } | null;
  };
}

// Resolved species only; the catalog facts (German name, difficulty, light zone) come through the catalog port.
export const CARDS = `select latin_name as "latinName", genus, family, order_name as "order", summary,
    summary_language as "summaryLanguage",
    image_url as "imageUrl", page_url as "pageUrl", genus_species_count as "genusSpeciesCount",
    nature_iucn_category as "iucnCategory", provenance->'iucn' as "iucnSource",
    nature_gbif_occurrences as "gbifOccurrences", provenance->'occurrences' as "occurrencesSource"
  from taxon where status = 'resolved'`;

export interface CardRow extends Omit<TaxonCardRecord, "natureRarity"> {
  readonly iucnCategory: IucnCategory | null;
  readonly iucnSource: { url: string; retrievedAt: string } | null;
  readonly gbifOccurrences: string | null;
  readonly occurrencesSource: { url: string; retrievedAt: string } | null;
}

// A value without its source is dropped: every shown value names its source (P-08).
export function natureRarityOf(r: CardRow): TaxonCardRecord["natureRarity"] {
  return {
    iucn:
      r.iucnCategory !== null && r.iucnSource
        ? { category: r.iucnCategory, url: r.iucnSource.url, retrievedAt: r.iucnSource.retrievedAt }
        : null,
    occurrences:
      r.gbifOccurrences !== null && r.occurrencesSource
        ? {
            count: Number(r.gbifOccurrences),
            url: r.occurrencesSource.url,
            retrievedAt: r.occurrencesSource.retrievedAt,
          }
        : null,
  };
}
