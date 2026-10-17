import type { Pool } from "pg";

// Same shape as `AttributeFact` in `core` (structurally equal; `db` does not import values from `core`).
type Field = "humidity" | "minTemperature" | "growthSize" | "toxicToPets";
export interface AttributeFactRecord {
  readonly species: string;
  readonly field: Field;
  readonly value: string | number | boolean;
  readonly evidence: {
    readonly source: "gbif" | "wikipedia" | "wikidata";
    readonly url: string;
    readonly license: "CC0-1.0" | "CC-BY-4.0" | "CC-BY-SA-4.0" | "CC-BY-SA-3.0";
    readonly retrievedAt: string;
  };
}

const COLUMN: Record<Field, string> = {
  humidity: "humidity",
  minTemperature: "min_temperature",
  growthSize: "growth_size",
  toxicToPets: "toxic_to_pets",
};
const FIELD = Object.fromEntries(Object.entries(COLUMN).map(([k, v]) => [v, k])) as Record<
  string,
  Field
>;

interface Row {
  latin_name: string;
  field: string;
  value: string | number | boolean;
  source: AttributeFactRecord["evidence"]["source"];
  source_url: string;
  license: AttributeFactRecord["evidence"]["license"];
  retrieved_on: string;
}

/**
 * Researched species attributes with source and license per field (US-ENT-09). Written by the worker with the owner
 * pool, read by the application role; the shared table has no account id (P-05).
 */
export class TaxonAttributesPostgres {
  constructor(private readonly pool: Pool) {}

  /** Replaces the facts of the field (new research wins; one row per species and field). */
  async save(facts: readonly AttributeFactRecord[]): Promise<void> {
    for (const f of facts)
      await this.pool.query(
        `insert into taxon_attribute (latin_name, field, value, source, source_url, license, retrieved_on)
         values ($1, $2, $3::jsonb, $4, $5, $6, $7)
         on conflict (latin_name, field) do update set value = excluded.value, source = excluded.source,
           source_url = excluded.source_url, license = excluded.license, retrieved_on = excluded.retrieved_on`,
        [
          f.species,
          COLUMN[f.field],
          JSON.stringify(f.value),
          f.evidence.source,
          f.evidence.url,
          f.evidence.license,
          f.evidence.retrievedAt,
        ],
      );
  }

  /** The stored facts of the species; a species or field without a row is unknown. */
  async forSpecies(names: readonly string[]): Promise<AttributeFactRecord[]> {
    if (names.length === 0) return [];
    const { rows } = await this.pool.query<Row>(
      `select latin_name, field, value, source, source_url, license, to_char(retrieved_on, 'YYYY-MM-DD') as retrieved_on
       from taxon_attribute where latin_name = any($1) order by latin_name, field`,
      [names],
    );
    return rows.map((r) => ({
      species: r.latin_name,
      field: FIELD[r.field] as Field,
      value: r.value,
      evidence: {
        source: r.source,
        url: r.source_url,
        license: r.license,
        retrievedAt: r.retrieved_on,
      },
    }));
  }
}
