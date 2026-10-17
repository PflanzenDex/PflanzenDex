import type { Pool, PoolClient } from "pg";

// Same shapes as `CatalogFillStore` in `core` (structurally equal; `db` does not import values from core).
type Field = "familyLatin" | "germanName" | "botanicalStory";
type Source = "gbif" | "wikidata" | "wikipedia";
export interface FillCandidateRecord {
  readonly id: string;
  readonly latinName: string;
  readonly empty: readonly Field[];
}
export interface SnapshotRecord {
  readonly speciesId: string;
  readonly source: Source;
  readonly sourceId: string | null;
  readonly retrievedAt: string;
  readonly link: string;
  readonly license: string;
  readonly raw: unknown;
}
export interface FieldValueRecord {
  readonly field: Field;
  readonly value: string;
  readonly origin: "source";
  readonly source: Source;
  readonly link: string;
  readonly license: string;
  readonly retrievedAt: string;
  readonly disputed: boolean;
}

const COLUMN: Record<Field, string> = {
  familyLatin: "family_latin",
  germanName: "german_name",
  botanicalStory: "botanical_story",
};
/**
 * GBIF and Wikipedia are asked for every species; Wikidata only when the article names an item. A species with the
 * snapshots of these two is therefore done, also when a field stayed unknown (P-08), and is not asked again.
 */
const ALWAYS_ASKED = 2;

/**
 * Database side of the catalog fill (US-BES-12): the approved species with gaps, the source snapshots (DM-BES-05) and
 * the field provenance (DM-BES-06). Needs the owner connection and sets no account (the worker, never a keeper).
 */
export class CatalogFillPostgres {
  constructor(private readonly pool: Pool) {}

  async candidates(): Promise<readonly FillCandidateRecord[]> {
    const { rows } = await this.pool.query<{
      id: string;
      latin_name: string;
      family_latin: string | null;
      german_name: string | null;
      botanical_story: string | null;
    }>(
      `select a.id, a.latin_name, a.family_latin, a.german_name, a.botanical_story from species a
        where a.cultivar is null and a.epithet is not null
          and exists (select from review_case v where v.object_kind = 'species' and v.object_id = a.id
                         and v.status in ('curated', 'reviewed'))
          and (a.family_latin is null or a.german_name is null or a.botanical_story is null)
          and (select count(*) from catalog_source_snapshot s
                where s.species_id = a.id and s.source in ('gbif', 'wikipedia')) < $1
        order by a.latin_name`,
      [ALWAYS_ASKED],
    );
    return rows.map((r) => ({
      id: r.id,
      latinName: r.latin_name,
      empty: (
        [
          ["familyLatin", r.family_latin],
          ["germanName", r.german_name],
          ["botanicalStory", r.botanical_story],
        ] as const
      )
        .filter(([, v]) => v === null)
        .map(([f]) => f),
    }));
  }

  /**
   * Keeps the snapshots and fills only the fields that are still empty, in one transaction. A field that has been
   * set meanwhile (reviewed or by a keeper's profile) stays and gets no provenance row (FR-BES-19). The catalog
   * version of the species rises once when at least one field was set (FR-BES-12).
   */
  async record(
    speciesId: string,
    snapshots: readonly SnapshotRecord[],
    values: readonly FieldValueRecord[],
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('app.catalog_fill', 'on', true)");
      for (const s of snapshots) await saveSnapshot(client, speciesId, s);
      const set = await fillEmpty(client, speciesId, values);
      if (set.length > 0) await saveProvenance(client, speciesId, set);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

const saveSnapshot = (client: PoolClient, speciesId: string, s: SnapshotRecord) =>
  client.query(
    `insert into catalog_source_snapshot (species_id, source, source_id, retrieved_at, link, license, raw)
     values ($1, $2, $3, $4, $5, $6, $7::jsonb)
     on conflict (species_id, source) do update set source_id = excluded.source_id,
       retrieved_at = excluded.retrieved_at, link = excluded.link, license = excluded.license, raw = excluded.raw`,
    [
      speciesId,
      s.source,
      s.sourceId,
      s.retrievedAt,
      s.link,
      s.license,
      s.raw === null || s.raw === undefined ? null : JSON.stringify(s.raw),
    ],
  );

/** Sets each value whose column is still empty; returns the ones that were set. */
async function fillEmpty(
  client: PoolClient,
  speciesId: string,
  values: readonly FieldValueRecord[],
) {
  const set: FieldValueRecord[] = [];
  for (const v of values) {
    const column = COLUMN[v.field];
    const r = await client.query(
      `update species set ${column} = $2 where id = $1 and ${column} is null`,
      [speciesId, v.value],
    );
    if (r.rowCount === 1) set.push(v);
  }
  return set;
}

/** One new catalog version of the species; every value that was set records its origin under that version. */
async function saveProvenance(
  client: PoolClient,
  speciesId: string,
  set: readonly FieldValueRecord[],
) {
  const bumped = await client.query<{ version: number }>(
    "update species set version = version + 1 where id = $1 returning version",
    [speciesId],
  );
  const version = bumped.rows[0]?.version;
  for (const v of set)
    await client.query(
      `insert into catalog_field_provenance
         (species_id, field, version, value, origin, source, link, license, retrieved_on, disputed)
       values ($1, $2, $3, $4, 'source', $5, $6, $7, $8, $9)`,
      [
        speciesId,
        COLUMN[v.field],
        version,
        v.value,
        v.source,
        v.link,
        v.license,
        v.retrievedAt.slice(0, 10),
        v.disputed,
      ],
    );
}
