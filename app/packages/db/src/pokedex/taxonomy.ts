import type { Pool, PoolClient } from "pg";

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
}
export interface TaxonomyRecord {
  readonly fingerprint: string;
  readonly builtAt: string;
  readonly taxa: readonly TaxonRecord[];
  readonly failures: readonly { readonly latinName: string; readonly reason: string }[];
}

const INSERT = `insert into taxon (latin_name, status, failure_code, accepted_name, genus, family, order_name, ott_id,
  summary, summary_language, image_url, page_url, genus_species_count, provenance, catalog_fingerprint, built_at)
  values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`;

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
  JSON.stringify({
    lineage: t.lineage.provenance,
    ...(t.text ? { text: t.text.provenance } : {}),
    ...(t.genusSpeciesCount ? { genus_count: t.genusSpeciesCount.provenance } : {}),
  }),
  b.fingerprint,
  b.builtAt,
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
];

/** Adapter for the taxonomy tree. Needs the owner connection: the application role may only read `taxon`. */
export class TaxonomyPostgres {
  constructor(private readonly pool: Pool) {}

  async fingerprint(): Promise<string | null> {
    const r = await this.pool.query<{ f: string }>(
      "select catalog_fingerprint as f from taxon limit 1",
    );
    return r.rows[0]?.f ?? null;
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
