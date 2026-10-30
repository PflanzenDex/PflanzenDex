import type { Pool } from "pg";
import { UNIQUE, FOREIGN_KEY, errorCode } from "./light-zones.ts";
import { withAccount } from "../kernel/index.ts";

// The shapes are the types of `core` (type-only import through its public entry, AB-2).
import type { LightLocation, LocationValues } from "@pflanzendex/core";
export type { LightLocation, LocationValues };
export interface ZoneUser {
  readonly kind: "location" | "specimen" | "species";
  readonly id: string;
  readonly name: string;
}

const COLUMNS = `id, name, light_zone_id as "lightZoneId", kind`;

/**
 * Adapter for locations. The composite foreign key (account_id, light_zone_id) prevents a location from pointing
 * to the zone of another account (the foreign key test also sees rows that the row rule hides).
 */
export class LocationPostgres {
  constructor(private readonly pool: Pool) {}

  async list(userId: string): Promise<readonly LightLocation[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<LightLocation>(`select ${COLUMNS} from location order by lower(name)`),
    );
    return r.rows;
  }

  async create(
    userId: string,
    w: LocationValues,
  ): Promise<LightLocation | "name_taken" | "zone_unknown"> {
    try {
      const r = await withAccount(this.pool, userId, (c) =>
        c.query<LightLocation>(
          `insert into location (account_id, name, light_zone_id, kind) values ($1, $2, $3, $4) returning ${COLUMNS}`,
          [userId, w.name, w.lightZoneId, w.kind],
        ),
      );
      return r.rows[0] as LightLocation;
    } catch (e) {
      return this.translate(e);
    }
  }

  async update(
    userId: string,
    id: string,
    w: LocationValues,
  ): Promise<LightLocation | "name_taken" | "not_found" | "zone_unknown"> {
    try {
      const r = await withAccount(this.pool, userId, (c) =>
        c.query<LightLocation>(
          `update location set name = $2, light_zone_id = $3, kind = $4 where id = $1 returning ${COLUMNS}`,
          [id, w.name, w.lightZoneId, w.kind],
        ),
      );
      return r.rows[0] ?? "not_found";
    } catch (e) {
      return this.translate(e);
    }
  }

  /**
   * Deletes a location unless something points to it (P-10). Specimens and care profiles are protected by their
   * foreign keys; other modules report their usage through the port `LocationUsage` before this runs.
   */
  async remove(userId: string, id: string): Promise<"deleted" | "not_found" | "in_use"> {
    try {
      const r = await withAccount(this.pool, userId, async (c) => {
        const gone = await c.query("delete from location where id = $1", [id]);
        return gone.rowCount === 1 ? ("deleted" as const) : ("not_found" as const);
      });
      return r;
    } catch (e) {
      if (errorCode(e) === FOREIGN_KEY) return "in_use";
      throw e;
    }
  }

  private translate(e: unknown): "name_taken" | "zone_unknown" {
    if (errorCode(e) === UNIQUE) return "name_taken";
    if (errorCode(e) === FOREIGN_KEY) return "zone_unknown";
    throw e;
  }

  /** Usage source for "delete zone" (port ZoneUsage in core): the locations of the zone. */
  async user(userId: string, lightZoneId: string): Promise<readonly ZoneUser[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<ZoneUser>(
        `select 'location' as kind, id, name from location where light_zone_id = $1 order by lower(name)`,
        [lightZoneId],
      ),
    );
    return r.rows;
  }
}
