import type { Pool } from "pg";

/** One stored Wikidata claim list of an approved species (same shape as `HeightCandidate` in `core`, claim of one property). */
export interface SourceClaimRecord {
  readonly latinName: string;
  readonly itemId: string;
  /** The `claims.<property>` array of the item exactly as received; its shape is not trusted. */
  readonly heightClaims: unknown;
  /** UTC calendar date of the stored answer. */
  readonly retrievedAt: string;
  readonly license: string;
}

/**
 * Reads claims out of the Wikidata answers the catalog fill stored (US-BES-12, DM-BES-05). Nothing is asked from any
 * server; only the claim of one property leaves the database, not the whole answer. Other modules reach the catalog
 * snapshots only through this class (AB-9).
 */
export class CatalogSourceClaims {
  constructor(private readonly pool: Pool) {}

  /** Approved species without cultivar whose stored Wikidata item has at least one claim of the property (`P<digits>`). */
  async wikidataClaims(property: string): Promise<SourceClaimRecord[]> {
    if (!/^P[0-9]{1,9}$/.test(property)) throw new Error(`not a Wikidata property: ${property}`);
    const { rows } = await this.pool.query<{
      latin_name: string;
      source_id: string;
      claims: unknown;
      retrieved_on: string;
      license: string;
    }>(
      `select s.latin_name, c.source_id, c.raw #> array['entities', c.source_id, 'claims', $1::text] as claims,
              to_char(c.retrieved_at at time zone 'UTC', 'YYYY-MM-DD') as retrieved_on, c.license
         from species s
         join catalog_source_snapshot c on c.species_id = s.id and c.source = 'wikidata'
        where s.cultivar is null and s.epithet is not null and c.source_id is not null
          and exists (select from review_case v where v.object_kind = 'species' and v.object_id = s.id
                         and v.status in ('curated', 'reviewed'))
          and c.raw #> array['entities', c.source_id, 'claims', $1::text] is not null
        order by s.latin_name`,
      [property],
    );
    return rows.map((r) => ({
      latinName: r.latin_name,
      itemId: r.source_id,
      heightClaims: r.claims,
      retrievedAt: r.retrieved_on,
      license: r.license,
    }));
  }
}
