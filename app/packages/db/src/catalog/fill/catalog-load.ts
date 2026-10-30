import type { Pool, PoolClient } from "pg";

/**
 * A species ready to be stored: parsed and normalized by the caller (the `db` package does not parse names). It has no
 * difficulty, default level or lux need (#1003) and no growth measure, etiolation signs or success criteria (#1005): the
 * batch never writes them, so they stay unknown (P-08).
 */
export interface LoadRecord {
  readonly latinName: string;
  readonly genus: string;
  readonly epithet: string;
  readonly germanName: string | null;
  readonly englishName: string | null;
  readonly familyLatin: string;
  readonly familyGerman: string | null;
  readonly source: string;
  /** Every searchable name: `latin`, `german`, `english`, `synonym`; `norm` is the normalized search key. */
  readonly names: readonly {
    field: "latin" | "german" | "english" | "synonym";
    display: string;
    norm: string;
  }[];
}

/** Origin of the entered values, stored per field in `catalog_field_provenance` (DM-BES-06, FR-BES-16). */
export interface LoadProvenance {
  readonly license: string;
  readonly retrievedOn: string;
}

/**
 * A further write of the same batch that runs with owner rights inside the same transaction, after the species (for
 * example the researched attributes of US-ENT-09, which belong to another module and are passed in by the caller).
 */
export type LoadExtraWrite = (client: PoolClient) => Promise<void>;

const LOCK_KEY = "catalog-load";

/**
 * Operator batch for the species catalog (#991): species, names and review case run as an account with the `operator`
 * role under the row rules of the application role, exactly like an application write (`created_by = 'operator'` and
 * status `curated` are only possible for that role). Only the per-field provenance, which the application role may
 * not write, is stored with owner rights in the same transaction. Needs the owner connection (no superuser).
 */
export class CatalogLoadPostgres {
  constructor(private readonly pool: Pool) {}

  /** Normalized Latin names that are already approved species (read only, nothing is created). */
  async presentLatin(norms: readonly string[]): Promise<ReadonlySet<string>> {
    const r = await this.pool.query<{ norm: string }>(
      `select n.norm from species_name n
        where n.field = 'latin' and n.norm = any($1) and species_status(n.species_id) in ('curated', 'reviewed')`,
      [norms],
    );
    return new Set(r.rows.map((x) => x.norm));
  }

  /**
   * Stores the species that are not in the catalog yet and runs `extra`, all or nothing; returns the Latin names it
   * created.
   */
  async load(
    operator: string,
    records: readonly LoadRecord[],
    provenance: LoadProvenance,
    extra?: LoadExtraWrite,
  ): Promise<readonly string[]> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      // One loader at a time: a second run waits and then finds everything present.
      await client.query("select pg_advisory_xact_lock(hashtext($1))", [LOCK_KEY]);
      await client.query("set local role pflanzendex_app");
      await client.query("select set_config('app.account_id', $1, true)", [operator]);
      const created: { id: string; record: LoadRecord }[] = [];
      for (const record of records) {
        const id = await insertIfNew(client, operator, record);
        if (id) created.push({ id, record });
      }
      // Back to the owner of the transaction for the provenance rows (no policy lets the application role write them).
      await client.query("reset role");
      for (const { id, record } of created) await saveProvenance(client, id, record, provenance);
      if (extra) await extra(client);
      await client.query("commit");
      return created.map((c) => c.record.latinName);
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

async function insertIfNew(
  client: PoolClient,
  operator: string,
  r: LoadRecord,
): Promise<string | null> {
  const keys = r.names
    .filter((n) => n.field === "latin" || n.field === "synonym")
    .map((n) => n.norm);
  const duplicate = await client.query(
    `select 1 from species_name n
      where n.field in ('latin', 'synonym') and n.norm = any($1) and species_status(n.species_id) is not null limit 1`,
    [keys],
  );
  if (duplicate.rowCount) return null;
  const id = (await client.query<{ id: string }>("select gen_random_uuid() as id")).rows[0]?.id;
  if (!id) throw new Error(`no id for ${r.latinName}`);
  await client.query(
    "insert into review_case (account_id, object_kind, object_id, status) values ($1, 'species', $2, 'curated')",
    [operator, id],
  );
  await client.query(
    `insert into species (id, created_by, latin_name, genus, epithet, german_name, english_name, family_latin,
       family_german, source)
     values ($1, 'operator', $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      r.latinName,
      r.genus,
      r.epithet,
      r.germanName,
      r.englishName,
      r.familyLatin,
      r.familyGerman,
      r.source,
    ],
  );
  await client.query(
    `insert into species_name (species_id, field, display, norm)
     select $1, * from unnest($2::text[], $3::text[], $4::text[])`,
    [id, r.names.map((n) => n.field), r.names.map((n) => n.display), r.names.map((n) => n.norm)],
  );
  return id;
}

/** Version 1 of the species holds the entered values; family and German name are the fields the provenance knows. */
async function saveProvenance(
  client: PoolClient,
  id: string,
  r: LoadRecord,
  p: LoadProvenance,
): Promise<void> {
  const fields = [
    ["family_latin", r.familyLatin],
    ["german_name", r.germanName],
  ] as const;
  for (const [field, value] of fields) {
    if (value === null) continue; // unknown stays unknown (P-08)
    await client.query(
      `insert into catalog_field_provenance (species_id, field, version, value, origin, license, retrieved_on)
       values ($1, $2, 1, $3, 'operator', $4, $5)`,
      [id, field, value, p.license, p.retrievedOn],
    );
  }
}
