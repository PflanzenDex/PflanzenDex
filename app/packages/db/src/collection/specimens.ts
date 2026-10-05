import type { Pool } from "pg";
import { withAccount } from "../kernel/index.ts";

import {
  COLUMNS,
  FOREIGN_KEY,
  SpeciesGone,
  ensureSpeciesVisible,
  pgError,
  type SpecimenRow,
} from "./specimen-shared.ts";
import { setLocations } from "./specimen-locations.ts";

export type { SpecimenRow };
export type SpecimenValues = Pick<
  SpecimenRow,
  "speciesId" | "name" | "marker" | "locationId" | "caughtAt"
> & { readonly status?: "plant" | "cutting" };

export interface MarkerAssignment {
  readonly specimenId: string;
  readonly name: string;
  readonly marker: string;
}

const UNIQUE = "23505";

/** A specimen of `assignments` that is unknown, foreign, archived or already has a marker: the transaction is undone. */
class UnknownSpecimen extends Error {}

/** Which unique rule a failed write violated: the name per account or the marker per species (US-BES-03). */
function takenBy(e: unknown): "name_taken" | "marker_taken" | null {
  if (pgError(e).code !== UNIQUE) return null;
  const constraint = pgError(e).constraint;
  if (constraint === "specimen_name_per_account") return "name_taken";
  return constraint === "specimen_marker_per_species" ? "marker_taken" : null;
}

/**
 * Adapter for specimens; every call runs as the account of the caller under the row rules (P-04). The location hangs on
 * the own account through the composite foreign key (account_id, location_id). The species hangs on the catalog through
 * a simple foreign key `specimen_species` (on delete restrict): `species` is registered as a global reference table
 * (AB-10, ADR 0003 O-2). The database guarantees that the species exists and is not deleted; whether the account may
 * see it (approved or own proposal) is checked by the operation in `core`.
 */
export class SpecimenPostgres {
  constructor(private readonly pool: Pool) {}

  async list(userId: string): Promise<readonly SpecimenRow[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<SpecimenRow>(`select ${COLUMNS} from specimen order by lower(name)`),
    );
    return r.rows;
  }

  /** How many specimens the account has that count (not archived, `isActive`); one cheap count, no rows (US-ACC-03). */
  /** Active and archived specimens of the account in one count (start page, US-ACC-03); writes nothing. */
  async countByStatus(userId: string): Promise<{ active: number; archived: number }> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<{ active: number; archived: number }>(
        `select count(*) filter (where status <> 'archived')::int as active,
                count(*) filter (where status = 'archived')::int as archived
           from specimen`,
      ),
    );
    return r.rows[0] ?? { active: 0, archived: 0 };
  }

  async find(userId: string, id: string): Promise<SpecimenRow | null> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<SpecimenRow>(`select ${COLUMNS} from specimen where id = $1`, [id]),
    );
    return r.rows[0] ?? null;
  }

  /**
   * All or nothing in one transaction: first the markers of the existing specimens (US-BES-03), then the new
   * specimen. The database decides uniqueness of name and marker, not a prior query; a rename touches only an
   * active specimen that has no marker yet, otherwise nothing is written and the answer is `specimen_unknown`.
   */
  async create(
    userId: string,
    w: SpecimenValues,
    assignments: readonly MarkerAssignment[] = [],
  ): Promise<
    | SpecimenRow
    | "name_taken"
    | "marker_taken"
    | "location_unknown"
    | "specimen_unknown"
    | "species_unknown"
  > {
    try {
      return await withAccount(this.pool, userId, async (c) => {
        for (const a of assignments) {
          const done = await c.query(
            `update specimen set name = $2, marker = $3
             where id = $1 and status <> 'archived' and marker is null`,
            [a.specimenId, a.name, a.marker],
          );
          if (!done.rowCount) throw new UnknownSpecimen();
        }
        const r = await c.query<SpecimenRow>(
          `insert into specimen (account_id, species_id, name, marker, location_id, caught_at, status)
           values ($1, $2, $3, $4, $5, $6, $7) returning ${COLUMNS}`,
          [userId, w.speciesId, w.name, w.marker, w.locationId, w.caughtAt, w.status ?? "plant"],
        );
        await ensureSpeciesVisible(c, w.speciesId);
        return r.rows[0] as SpecimenRow;
      });
    } catch (e) {
      if (e instanceof UnknownSpecimen) return "specimen_unknown";
      if (e instanceof SpeciesGone) return "species_unknown";
      const taken = takenBy(e);
      if (taken) return taken;
      if (pgError(e).code === FOREIGN_KEY && pgError(e).constraint === "specimen_location")
        return "location_unknown";
      throw e;
    }
  }

  /**
   * One statement: marker and name of one active specimen (US-BES-03); id, species, location, date and status stay.
   * An archived specimen stays unchanged (its name stays taken, US-BES-07); a foreign one is invisible (P-04).
   */
  async mark(
    userId: string,
    id: string,
    w: { readonly name: string; readonly marker: string },
  ): Promise<SpecimenRow | "not_found" | "archived" | "name_taken" | "marker_taken"> {
    const sql = `update specimen set name = $2, marker = $3 where id = $1 and status <> 'archived'
         returning ${COLUMNS}`;
    try {
      return await this.change(userId, { sql, parameter: [id, w.name, w.marker] }, "archived");
    } catch (e) {
      const taken = takenBy(e);
      if (taken) return taken;
      throw e;
    }
  }

  /**
   * One statement: only a cutting becomes a plant (US-BES-04). Plants and archived specimens stay unchanged and report
   * `not_a_cutting`; foreign specimens are invisible to the row rule.
   */
  async repot(userId: string, id: string): Promise<SpecimenRow | "not_found" | "not_a_cutting"> {
    const sql = `update specimen set status = 'plant' where id = $1 and status = 'cutting' returning ${COLUMNS}`;
    return this.change(userId, { sql, parameter: [id] }, "not_a_cutting");
  }

  /**
   * One statement: status, date, reason and the status from before. Only a not yet archived specimen is changed, a
   * second archiving leaves date and reason of the first (P-10). Foreign specimens are invisible to the row rule.
   */
  async archive(
    userId: string,
    id: string,
    reason: string,
    date: string,
  ): Promise<SpecimenRow | "not_found" | "already_archived"> {
    const sql = `update specimen set status_before_archived = status, status = 'archived', archived_at = $2,
         archived_reason = $3 where id = $1 and status <> 'archived' returning ${COLUMNS}`;
    return this.change(userId, { sql, parameter: [id, date, reason] }, "already_archived");
  }

  /** All or nothing in one transaction (US-PHA-03); see `setLocations` in `specimen-locations.ts`. */
  async setLocations(
    userId: string,
    assignments: readonly { readonly specimenId: string; readonly locationId: string }[],
  ): Promise<readonly SpecimenRow[] | "specimen_unknown" | "archived" | "location_unknown"> {
    return setLocations(this.pool, userId, assignments);
  }

  /** Resets the status from before the archiving (without statement: plant) and deletes date and reason. */
  async restore(userId: string, id: string): Promise<SpecimenRow | "not_found" | "not_archived"> {
    const sql = `update specimen set status = coalesce(status_before_archived, 'plant'), status_before_archived = null,
         archived_at = null, archived_reason = null where id = $1 and status = 'archived' returning ${COLUMNS}`;
    return this.change(userId, { sql, parameter: [id] }, "not_archived");
  }

  /** Executes the change (`$1` is the ID); if it changes nothing, a query decides between "does not exist" and `otherwise`. */
  private async change<S extends string>(
    userId: string,
    instruction: { sql: string; parameter: readonly unknown[] },
    otherwise: S,
  ): Promise<SpecimenRow | "not_found" | S> {
    return withAccount(this.pool, userId, async (c) => {
      const r = await c.query<SpecimenRow>(instruction.sql, [...instruction.parameter]);
      if (r.rows[0]) return r.rows[0];
      const da = await c.query("select 1 from specimen where id = $1", [instruction.parameter[0]]);
      return da.rowCount ? otherwise : "not_found";
    });
  }
}
