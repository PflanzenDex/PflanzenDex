import type { Pool } from "pg";
import { withAccount } from "../kernel/index.ts";

import {
  COLUMNS,
  FOREIGN_KEY,
  SpeciesGone,
  UnknownSpecimen,
  createSpecimenOn,
  pgError,
  repotCutting,
  setCaughtAt,
  takenBy,
  type SpecimenRow,
  type SpecimenValues,
} from "./specimen-shared.ts";
import { setLightZone, setLocations, zoneUsers } from "./specimen/specimen-locations.ts";

export type { SpecimenRow, SpecimenValues };

export interface MarkerAssignment {
  readonly specimenId: string;
  readonly name: string;
  readonly marker: string;
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

  /** `find` for many IDs in ONE statement (NFR-12): same row rules, `null` for foreign or unknown IDs, same order as the IDs. */
  async findMany(userId: string, ids: readonly string[]): Promise<readonly (SpecimenRow | null)[]> {
    if (ids.length === 0) return [];
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<SpecimenRow>(`select ${COLUMNS} from specimen where id = any($1)`, [ids]),
    );
    const byId = new Map(r.rows.map((s) => [s.id, s] as const));
    return ids.map((id) => byId.get(id.toLowerCase()) ?? null);
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
    | "zone_unknown"
    | "specimen_unknown"
    | "species_unknown"
  > {
    try {
      return await withAccount(this.pool, userId, (c) =>
        createSpecimenOn(c, userId, w, assignments),
      );
    } catch (e) {
      if (e instanceof UnknownSpecimen) return "specimen_unknown";
      if (e instanceof SpeciesGone) return "species_unknown";
      const taken = takenBy(e);
      if (taken) return taken;
      if (pgError(e).code === FOREIGN_KEY && pgError(e).constraint === "specimen_location")
        return "location_unknown";
      if (pgError(e).code === FOREIGN_KEY && pgError(e).constraint === "specimen_light_zone")
        return "zone_unknown";
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

  /** Only a cutting becomes a plant (US-BES-04); see `repotCutting` in `specimen-shared.ts` (issue 1103). */
  async repot(
    userId: string,
    id: string,
    date: string | null,
    chosenDate: string | null,
  ): Promise<SpecimenRow | "not_found" | "not_a_cutting" | "before_caught"> {
    return repotCutting(this.pool, userId, id, { date, chosenDate });
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

  /** Own light zone of a specimen (US-LIC-02); see `setLightZone` in `specimen-locations.ts`. */
  async setLightZone(userId: string, id: string, lightZoneId: string | null) {
    return setLightZone(this.pool, userId, id, lightZoneId);
  }

  /** The specimens that carry the zone (port "zone usage", US-LIC-05); see `zoneUsers` in `specimen-locations.ts`. */
  async zoneUsers(userId: string, lightZoneId: string) {
    return zoneUsers(this.pool, userId, lightZoneId);
  }

  /** Corrects the catch date (US-BES-11); see `setCaughtAt` in `specimen-shared.ts`. */
  async setCaughtAt(userId: string, id: string, date: string) {
    return setCaughtAt(this.pool, userId, id, date);
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
