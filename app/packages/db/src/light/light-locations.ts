import type { Pool } from "pg";
import { UNIQUE, FOREIGN_KEY, errorCode } from "./light-zones.ts";
import { withAccount } from "../kernel/index.ts";

export type LocationKind = "indoor" | "outdoor";
export interface LightLocation {
  readonly id: string;
  readonly name: string;
  readonly lightZoneId: string | null;
  readonly kind: LocationKind;
}
export interface LocationValues {
  readonly name: string;
  readonly lightZoneId: string | null;
  readonly kind: LocationKind;
}
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
