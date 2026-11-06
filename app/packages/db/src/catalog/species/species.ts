import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { withAccount } from "../../kernel/index.ts";
import {
  APPROVED_FACTS,
  COLUMN,
  FIELDS,
  NOT_MERGED,
  SEARCH_LIMIT,
  SELECTION,
  VISIBLE,
  exactQuery,
  searchQuery,
} from "./species-read.ts";

// The shapes are the interfaces of `core` (type-only import through its public entry, AB-2).
import type {
  NameField,
  Species,
  SpeciesCreation,
  SpeciesHit,
  SpeciesName,
  SpeciesSearch,
  SpeciesValues,
} from "@pflanzendex/core";
export interface SpeciesFacts {
  readonly latinName: string;
  readonly germanName: string | null;
  readonly difficulty: number | null;
  readonly lightZone: number | null;
}
export type { Species, SpeciesCreation, SpeciesName, SpeciesValues };

const BY_IDS = `select ${SELECTION} from species a where a.id = any($1::uuid[]) and ${VISIBLE}`;

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
    const r = await withAccount(this.pool, userId, (c) => c.query<SpeciesFacts>(APPROVED_FACTS));
    return r.rows;
  }

  /** The visible species that match; `more` is true when one more row came back, i.e. more match than the cap shows. */
  async search(userId: string, norm: string | null): Promise<SpeciesSearch> {
    const { text, values } = searchQuery(norm);
    const hits = await this.hits(userId, text, values);
    return { species: hits.slice(0, SEARCH_LIMIT), more: hits.length > SEARCH_LIMIT };
  }

  /** The visible species with a name equal to `norm` as a whole, without the cap (FR-BES-24). */
  async exact(userId: string, norm: string): Promise<readonly SpeciesHit[]> {
    const { text, values } = exactQuery(norm);
    return this.hits(userId, text, values);
  }

  private async hits(userId: string, text: string, values: unknown[]): Promise<SpeciesHit[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<Species & { field: NameField | null; display: string | null }>(text, values),
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

  /**
   * The distinct Latin names of the given species, in ONE statement (NFR-12, #1238). The ids come from the caller's own
   * specimens (the collection port); the visibility is that of `find`: a species the account cannot see is left out.
   */
  async latinNamesOf(userId: string, ids: readonly string[]): Promise<readonly string[]> {
    if (ids.length === 0) return [];
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<{ latinName: string }>(
        `select distinct a.latin_name as "latinName" from species a where a.id = any($1::uuid[]) and ${VISIBLE}`,
        [ids],
      ),
    );
    return r.rows.map((row) => row.latinName);
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
          where n.field in ('latin', 'synonym') and n.norm = any($1)
            and exists (select from species a where a.id = n.species_id and ${VISIBLE})
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
