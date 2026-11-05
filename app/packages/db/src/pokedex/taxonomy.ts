import type { Pool, PoolClient } from "pg";
import {
  CARDS,
  natureRarityOf,
  type CardRow,
  type IucnCategory,
  type TaxonCardRecord,
} from "./taxon-cards.ts";

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

/** Adapter for the taxonomy tree. Writing needs the owner connection: the application role may only read `taxon`. */
export class TaxonomyPostgres {
  constructor(private readonly pool: Pool) {}

  async fingerprint(): Promise<string | null> {
    const r = await this.pool.query<{ f: string }>(
      "select catalog_fingerprint as f from taxon limit 1",
    );
    return r.rows[0]?.f ?? null;
  }

  /**
   * The version of the stored tree (FR-POK-13): the fingerprint of its build and the build time. `replace` is the only
   * writer and stamps every row alike, so one row tells the version; `null` before the first build. The cards cache keys on it.
   */
  async version(): Promise<string | null> {
    const r = await this.pool.query<{ v: string }>(
      "select catalog_fingerprint || '@' || built_at::text as v from taxon limit 1",
    );
    return r.rows[0]?.v ?? null;
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
      await c.query("analyze taxon"); // NFR-12: planner statistics of the new tree
      await c.query("commit");
    } catch (error) {
      await c.query("rollback");
      throw error;
    } finally {
      c.release();
    }
  }
}
