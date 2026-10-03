import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { withAccount } from "../kernel/index.ts";

// Same shapes as the interfaces in `core` (structurally equal; `db` does not import `core`).
export type NameField = "latin" | "german" | "english" | "synonym";
export interface SpeciesName {
  readonly field: NameField;
  readonly display: string;
  readonly norm: string;
}
export interface SpeciesValues {
  readonly latinName: string;
  readonly genus: string;
  readonly epithet: string | null;
  readonly cultivar: string | null;
  readonly germanName: string | null;
  readonly englishName: string | null;
  readonly synonyms: readonly string[];
  readonly familyGerman: string | null;
  readonly familyLatin: string | null;
  readonly difficulty: number;
  readonly standardLevel: number;
  readonly lightDemandLux: number;
  readonly dormancyFrom: string | null;
  readonly dormancyUntil: string | null;
  readonly locationHint: string | null;
  readonly growthMeasure: "height" | "rosette_diameter" | "shoot_length";
  readonly etiolationSigns: string;
  readonly wateringHint: string | null;
  readonly substrate: string | null;
  readonly pruning: string | null;
  readonly growthHacks: string | null;
  readonly successCriteria: string;
  readonly botanicalStory: string | null;
  readonly source: string | null;
}
export interface Species extends SpeciesValues {
  readonly id: string;
  readonly reviewStatus: "proposal" | "ai_unreviewed" | "curated" | "reviewed" | "rejected";
  readonly createdBy: "operator" | "reviewer" | "user";
  readonly own: boolean;
  readonly version: number;
}
export interface SpeciesHit extends Species {
  readonly hit: { readonly field: NameField; readonly display: string } | null;
}
export type SpeciesCreation = { readonly kind: "fresh" | "duplicate"; readonly value: Species };

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
  species_status(a.id) as "reviewStatus", a.created_by as "createdBy", species_own(a.id) as "own", a.version`;

const mask = (norm: string) => `%${norm.replace(/[\\%_]/g, "\\$&")}%`;

/**
 * Adapter for the species catalog; every call runs as the caller's account under the row rules: own proposals
 * and approved species are visible (FR-BES-11, P-04). The application can neither change nor delete.
 */
export class SpeciesPostgres {
  constructor(private readonly pool: Pool) {}

  async search(userId: string, norm: string | null): Promise<readonly SpeciesHit[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<Species & { field: NameField | null; display: string | null }>(
        `select ${SELECTION}, t.field, t.display from species a
           left join lateral (
             select n.field, n.display from species_name n
              where n.species_id = a.id and $1::text is not null and n.norm like $1::text
              order by array_position(array['latin','german','english','synonym'], n.field) limit 1) t on true
          where $1::text is null or t.field is not null
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
    return withAccount(this.pool, userId, (c) => load(c, id));
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
          where n.field in ('latin', 'synonym') and n.norm = any($1) limit 1`,
        [key.map((n) => n.norm)],
      );
      const present = await load(c, duplicate.rows[0]?.id);
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
      return { kind: "fresh", value: (await load(c, id)) as Species };
    });
  }
}

async function load(c: PoolClient, id: string | undefined): Promise<Species | null> {
  if (!id) return null;
  const r = await c.query<Species>(`select ${SELECTION} from species a where a.id = $1`, [id]);
  return r.rows[0] ?? null;
}
