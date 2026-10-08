import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { withAccount } from "../kernel/index.ts";

// The shapes are the interfaces of `core` (type-only import through its public entry, AB-2).
import type {
  NameField,
  Species,
  SpeciesCreation,
  SpeciesHit,
  SpeciesName,
  SpeciesValues,
} from "@pflanzendex/core";
export interface SpeciesFacts {
  readonly latinName: string;
  readonly germanName: string | null;
  readonly difficulty: number | null;
  readonly lightZone: number | null;
}
export type { Species, SpeciesCreation, SpeciesHit, SpeciesName, SpeciesValues };

/** Column per field (without synonyms: they live in `species_name`). */
const COLUMN: Record<Exclude<keyof SpeciesValues, "synonyms">, string> = {
  latinName: "latin_name",
  genus: "genus",
  epithet: "epithet",
  cultivar: "cultivar",
  germanName: "german_name",
  englishName: "english_name",
  familyGerman: "family_german",
  familyLatin: "family_latin",
  difficulty: "difficulty",
  standardLevel: "standard_level",
  lightDemandLux: "light_demand_lux",
  dormancyFrom: "dormancy_from",
  dormancyUntil: "dormancy_until",
  locationHint: "location_hint",
  growthMeasure: "growth_measure",
  etiolationSigns: "etiolation_signs",
  wateringHint: "watering_hint",
  substrate: "substrate",
  pruning: "pruning",
  growthHacks: "growth_hacks",
  successCriteria: "success_criteria",
  botanicalStory: "botanical_story",
  source: "source",
};
const FIELDS = Object.keys(COLUMN) as (keyof typeof COLUMN)[];

// Status and ownership come from functions with owner rights (migration 0005): the review list hides foreign cases.
const SELECTION = `a.id, ${FIELDS.map((f) => `a.${COLUMN[f]} as "${f}"`).join(", ")},
  coalesce((select array_agg(n.display order by n.display) from species_name n
             where n.species_id = a.id and n.field = 'synonym'), '{}') as "synonyms",
  coalesce(species_status(a.id), (select v.status from review_case v where v.object_kind = 'species' and v.object_id = a.id)) as "reviewStatus",
  (select v.reason from review_case v where v.object_kind = 'species' and v.object_id = a.id
      and v.account_id = current_account()) as "reviewReason",
  a.created_by as "createdBy", species_own(a.id) as "own", a.version`;

// What the application shows: approved species and own proposals (FR-BES-11). Reviewers may additionally read foreign
// open proposals by row rule (US-BES-10); only `findForReview` asks for them.
const VISIBLE = "species_status(a.id) is not null";
const BY_IDS = `select ${SELECTION} from species a where a.id = any($1::uuid[]) and ${VISIBLE}`;
// A merged proposal is a duplicate that is gone for everybody, reviewers included.
const NOT_MERGED = `not exists (select from review_case v where v.object_kind = 'species' and v.object_id = a.id and v.status = 'merged')`;

const mask = (norm: string) => `%${norm.replace(/[\\%_]/g, "\\$&")}%`;

/**
 * Adapter for the species catalog; every call runs as the caller's account under the row rules: own proposals
 * and approved species are visible (FR-BES-11, P-04). The application can neither change nor delete.
 */
export class SpeciesPostgres {
  constructor(private readonly pool: Pool) {}

  /**
   * Latin names (genus and epithet, no cultivar) of the approved species: the input of the taxonomy build (US-POK-03).
   * Needs the owner connection and sets no account; only reviewed or curated species count, never proposals.
   */
  async approvedLatinNames(): Promise<readonly string[]> {
    const r = await this.pool.query<{ latin_name: string }>(
      `select a.latin_name from species a
        where a.cultivar is null and a.epithet is not null
          and exists (select from review_case v where v.object_kind = 'species' and v.object_id = a.id
                         and v.status in ('curated', 'reviewed'))
        order by a.latin_name`,
    );
    return r.rows.map((x) => x.latin_name);
  }

  /**
   * German name, difficulty and standard light zone of the approved species (no cultivars, no proposals): the facts
   * the Pokédex cards show next to the taxonomy (US-POK-01).
   */
  async approvedFacts(userId: string): Promise<readonly SpeciesFacts[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<SpeciesFacts>(
        `select a.latin_name as "latinName", a.german_name as "germanName", a.difficulty,
                a.standard_level as "lightZone"
           from species a
          where a.cultivar is null and species_status(a.id) in ('curated', 'reviewed')`,
      ),
    );
    return r.rows;
  }

  async search(userId: string, norm: string | null): Promise<readonly SpeciesHit[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<Species & { field: NameField | null; display: string | null }>(
        `select ${SELECTION}, t.field, t.display from species a
           left join lateral (
             select n.field, n.display from species_name n
              where n.species_id = a.id and $1::text is not null and n.norm like $1::text
              order by array_position(array['latin','german','english','synonym'], n.field) limit 1) t on true
          where ($1::text is null or t.field is not null) and ${VISIBLE}
          order by a.latin_name limit 50`,
        [norm === null ? null : mask(norm)],
      ),
    );
    return r.rows.map(({ field, display, ...species }) => ({
      ...species,
      hit: field && display ? { field, display } : null,
    }));
  }

  async find(userId: string, id: string): Promise<Species | null> {
    return withAccount(this.pool, userId, (c) => load(c, id, VISIBLE));
  }

  /** `find` for many IDs in ONE statement (NFR-12): same visibility, `null` for unreadable or unknown IDs. */
  async findMany(userId: string, ids: readonly string[]): Promise<readonly (Species | null)[]> {
    if (ids.length === 0) return [];
    const r = await withAccount(this.pool, userId, (c) => c.query<Species>(BY_IDS, [ids]));
    const byId = new Map(r.rows.map((s) => [s.id, s] as const));
    return ids.map((id) => byId.get(id.toLowerCase()) ?? null);
  }

  /** The species a merged proposal of the account went into (US-BES-10); `null` for everything else. */
  async mergedInto(userId: string, id: string): Promise<{ id: string; latinName: string } | null> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<{ id: string; latinName: string }>(
        `select t.id, t.latin_name as "latinName" from review_case v
           join species t on t.id = v.merged_into
          where v.object_kind = 'species' and v.object_id = $1 and v.status = 'merged'
            and v.account_id = current_account()`,
        [id],
      ),
    );
    return r.rows[0] ?? null;
  }

  /** Reviewers also get foreign open proposals (row rule `reviewer_reads`); everybody else gets what `find` gets. */
  async findForReview(userId: string, id: string): Promise<Species | null> {
    return withAccount(this.pool, userId, (c) => load(c, id, NOT_MERGED));
  }

  /** Duplicate check, review case, species and names in one transaction: all or nothing (FR-BES-03). */
  async create(
    userId: string,
    w: SpeciesValues,
    names: readonly SpeciesName[],
  ): Promise<SpeciesCreation> {
    return withAccount(this.pool, userId, async (c) => {
      const key = names.filter((n) => n.field === "latin" || n.field === "synonym");
      const duplicate = await c.query<{ id: string }>(
        `select n.species_id as id from species_name n
          where n.field in ('latin', 'synonym') and n.norm = any($1) and species_status(n.species_id) is not null
          limit 1`,
        [key.map((n) => n.norm)],
      );
      const present = await load(c, duplicate.rows[0]?.id, VISIBLE);
      if (present) return { kind: "duplicate", value: present };
      const id = randomUUID();
      await c.query(
        `insert into review_case (account_id, object_kind, object_id, status) values ($1, 'species', $2, 'proposal')`,
        [userId, id],
      );
      const columns = FIELDS.map((f) => COLUMN[f]);
      await c.query(
        `insert into species (id, created_by, ${columns.join(", ")})
         values ($1, 'user', ${columns.map((_, i) => `$${i + 2}`).join(", ")})`,
        [id, ...FIELDS.map((f) => w[f])],
      );
      await c.query(
        `insert into species_name (species_id, field, display, norm)
         select $1, * from unnest($2::text[], $3::text[], $4::text[])`,
        [id, names.map((n) => n.field), names.map((n) => n.display), names.map((n) => n.norm)],
      );
      return { kind: "fresh", value: (await load(c, id, VISIBLE)) as Species };
    });
  }
}

async function load(c: PoolClient, id: string | undefined, where: string): Promise<Species | null> {
  if (!id) return null;
  const r = await c.query<Species>(
    `select ${SELECTION} from species a where a.id = $1 and ${where}`,
    [id],
  );
  return r.rows[0] ?? null;
}
