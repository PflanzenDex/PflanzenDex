import type { Pool, PoolClient } from "pg";

type IucnCategory = "LC" | "NT" | "VU" | "EN" | "CR" | "EW" | "EX" | "DD";

// Same shapes as `TaxonomyBuild` in `core` (structurally equal; `db` does not import values from `core`).
interface Provenance {
  readonly source: string;
  readonly url: string;
  readonly retrievedAt: string;
}
export interface TaxonRecord {
  readonly latinName: string;
  readonly lineage: {
    readonly ottId: number;
    readonly acceptedName: string;
    readonly genus: string;
    readonly family: string | null;
    readonly order: string | null;
    readonly provenance: Provenance;
  };
  readonly text: {
    readonly language: "de" | "en";
    readonly text: string | null;
    readonly imageUrl: string | null;
    readonly pageUrl: string;
    readonly provenance: Provenance;
  } | null;
  readonly genusSpeciesCount: { readonly value: number; readonly provenance: Provenance } | null;
  readonly natureRarity: {
    readonly iucn: { readonly category: IucnCategory; readonly provenance: Provenance } | null;
    readonly occurrences: { readonly count: number; readonly provenance: Provenance } | null;
  };
}
export interface TaxonomyRecord {
  readonly fingerprint: string;
  readonly builtAt: string;
  readonly taxa: readonly TaxonRecord[];
  readonly failures: readonly { readonly latinName: string; readonly reason: string }[];
}

const INSERT = `insert into taxon (latin_name, status, failure_code, accepted_name, genus, family, order_name, ott_id,
  summary, summary_language, image_url, page_url, genus_species_count, provenance, catalog_fingerprint, built_at,
  nature_iucn_category, nature_gbif_occurrences)
  values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`;

// Source, URL and retrieval time of every stored value group; a group without a value has no entry.
const provenanceOf = (t: TaxonRecord) => ({
  lineage: t.lineage.provenance,
  ...(t.text ? { text: t.text.provenance } : {}),
  ...(t.genusSpeciesCount ? { genus_count: t.genusSpeciesCount.provenance } : {}),
  ...(t.natureRarity.iucn ? { iucn: t.natureRarity.iucn.provenance } : {}),
  ...(t.natureRarity.occurrences ? { occurrences: t.natureRarity.occurrences.provenance } : {}),
});

const resolvedRow = (t: TaxonRecord, b: TaxonomyRecord) => [
  t.latinName,
  "resolved",
  null,
  t.lineage.acceptedName,
  t.lineage.genus,
  t.lineage.family,
  t.lineage.order,
  t.lineage.ottId,
  t.text?.text ?? null,
  t.text?.language ?? null,
  t.text?.imageUrl ?? null,
  t.text?.pageUrl ?? null,
  t.genusSpeciesCount?.value ?? null,
  JSON.stringify(provenanceOf(t)),
  b.fingerprint,
  b.builtAt,
  t.natureRarity.iucn?.category ?? null,
  t.natureRarity.occurrences?.count ?? null,
];

const failedRow = (f: TaxonomyRecord["failures"][number], b: TaxonomyRecord) => [
  f.latinName,
  "unresolved",
  f.reason,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  "{}",
  b.fingerprint,
  b.builtAt,
  null,
  null,
];

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
const CARDS = `select latin_name as "latinName", genus, family, order_name as "order", summary,
    summary_language as "summaryLanguage",
    image_url as "imageUrl", page_url as "pageUrl", genus_species_count as "genusSpeciesCount",
    nature_iucn_category as "iucnCategory", provenance->'iucn' as "iucnSource",
    nature_gbif_occurrences as "gbifOccurrences", provenance->'occurrences' as "occurrencesSource"
  from taxon where status = 'resolved'`;

interface CardRow extends Omit<TaxonCardRecord, "natureRarity"> {
  readonly iucnCategory: IucnCategory | null;
  readonly iucnSource: { url: string; retrievedAt: string } | null;
  readonly gbifOccurrences: string | null;
  readonly occurrencesSource: { url: string; retrievedAt: string } | null;
}

// A value without its source is dropped: every shown value names its source (P-08).
function natureRarityOf(r: CardRow): TaxonCardRecord["natureRarity"] {
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

/** Adapter for the taxonomy tree. Writing needs the owner connection: the application role may only read `taxon`. */
export class TaxonomyPostgres {
  constructor(private readonly pool: Pool) {}

  async fingerprint(): Promise<string | null> {
    const r = await this.pool.query<{ f: string }>(
      "select catalog_fingerprint as f from taxon limit 1",
    );
    return r.rows[0]?.f ?? null;
  }

  /** The resolved tree for the collector cards: shared by all accounts, no user data (readable by the application role). */
  async tree(): Promise<readonly TaxonCardRecord[]> {
    const rows = (await this.pool.query<CardRow>(CARDS)).rows;
    return rows.map(
      ({ iucnCategory, iucnSource, gbifOccurrences, occurrencesSource, ...rest }) => ({
        ...rest,
        natureRarity: natureRarityOf({
          ...rest,
          iucnCategory,
          iucnSource,
          gbifOccurrences,
          occurrencesSource,
        }),
      }),
    );
  }

  /** Replaces the whole tree in one transaction: on any error nothing changes (US-POK-03). */
  async replace(build: TaxonomyRecord): Promise<void> {
    const c: PoolClient = await this.pool.connect();
    try {
      await c.query("begin");
      await c.query("delete from taxon");
      for (const t of build.taxa) await c.query(INSERT, resolvedRow(t, build));
      for (const f of build.failures) await c.query(INSERT, failedRow(f, build));
      await c.query("commit");
    } catch (error) {
      await c.query("rollback");
      throw error;
    } finally {
      c.release();
    }
  }
}
