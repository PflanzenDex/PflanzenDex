import type { Pool } from "pg";
import { withAccount } from "../kernel/index.ts";

// Same shapes as the interfaces in `core` (structurally equal; `db` does not import `core`).
export interface SpecimenRow {
  readonly id: string;
  readonly speciesId: string;
  readonly name: string;
  readonly marker: string | null;
  readonly locationId: string | null;
  readonly status: "plant" | "cutting" | "archived";
  readonly caughtAt: string | null;
  readonly archivedAt: string | null;
  readonly archivedReason: string | null;
}
export type SpecimenValues = Pick<
  SpecimenRow,
  "speciesId" | "name" | "marker" | "locationId" | "caughtAt"
> & { readonly status?: "plant" | "cutting" };

// `date` comes back as text: the driver would turn it into a `Date` in the server's time zone (NFR-08).
const COLUMNS = `id, species_id as "speciesId", name, marker, location_id as "locationId", status,
  to_char(caught_at, 'YYYY-MM-DD') as "caughtAt", to_char(archived_at, 'YYYY-MM-DD') as "archivedAt",
  archived_reason as "archivedReason"`;

export interface MarkerAssignment {
  readonly specimenId: string;
  readonly name: string;
  readonly marker: string;
}

const UNIQUE = "23505";
const FOREIGN_KEY = "23503";
const pgError = (e: unknown) => e as { code?: string; constraint?: string };

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

  async find(userId: string, id: string): Promise<SpecimenRow | null> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<SpecimenRow>(`select ${COLUMNS} from specimen where id = $1`, [id]),
    );
    return r.rows[0] ?? null;
  }

  /** One statement: all or nothing. The database decides name uniqueness, not a prior query. */
  async create(
    userId: string,
    w: SpecimenValues,
    assignments: readonly MarkerAssignment[] = [],
  ): Promise<
    SpecimenRow | "name_taken" | "marker_taken" | "location_unknown" | "specimen_unknown"
  > {
    void assignments; // skeleton for the red run (US-BES-03)
    try {
      const r = await withAccount(this.pool, userId, (c) =>
        c.query<SpecimenRow>(
          `insert into specimen (account_id, species_id, name, marker, location_id, caught_at, status)
           values ($1, $2, $3, $4, $5, $6, $7) returning ${COLUMNS}`,
          [userId, w.speciesId, w.name, w.marker, w.locationId, w.caughtAt, w.status ?? "plant"],
        ),
      );
      return r.rows[0] as SpecimenRow;
    } catch (e) {
      if (pgError(e).code === UNIQUE && pgError(e).constraint === "specimen_name_per_account")
        return "name_taken";
      if (pgError(e).code === FOREIGN_KEY && pgError(e).constraint === "specimen_location")
        return "location_unknown";
      throw e;
    }
  }

  /** Skeleton for the red run (US-BES-03). */
  async mark(
    userId: string,
    id: string,
    w: { readonly name: string; readonly marker: string },
  ): Promise<SpecimenRow | "not_found" | "archived" | "name_taken" | "marker_taken"> {
    void [userId, id, w];
    return "not_found";
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
