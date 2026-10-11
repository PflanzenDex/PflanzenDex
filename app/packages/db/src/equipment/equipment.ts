import type { Pool, PoolClient } from "pg";
import { withAccount } from "../kernel/index.ts";

// The shapes are the types of `core` (type-only import through its public entry, AB-2).
import type {
  ChangeResult,
  EquipmentRow,
  EquipmentStatus,
  EquipmentValues,
  MaintenanceData,
} from "@pflanzendex/core";
export type { EquipmentRow, EquipmentStatus, EquipmentValues };

const UNIQUE = "23505";
const FOREIGN_KEY = "23503";
const ZONE_KEY = "equipment_light_zone";

/** Only the foreign key of the zone means "unknown zone"; any other violation is a real fault (P-10). */
const isZoneKey = (e: unknown): boolean =>
  (e as { code?: string }).code === FOREIGN_KEY &&
  (e as { constraint?: string }).constraint === ZONE_KEY;

// Dates leave as text `YYYY-MM-DD` (NFR-08), the price as a number.
const COLUMNS = `id, type, name, status, manufacturer, model, product_id as "productId",
  price_eur::float8 as "priceEur", to_char(bought_at, 'YYYY-MM-DD') as "boughtAt", note,
  light_zone_id as "lightZoneId", power_w as "powerW", lux_statement as "luxStatement",
  to_char(in_operation_since, 'YYYY-MM-DD') as "inOperationSince", check_interval_days as "checkIntervalDays",
  to_char(last_checked_on, 'YYYY-MM-DD') as "lastCheckedOn", lifetime_value as "lifetimeValue",
  lifetime_source as "lifetimeSource"`;

/**
 * Adapter for equipment; every call runs as the account of the caller under the row rules (P-04, P-05). The light zone
 * of a lamp hangs on the own account through the composite foreign key (account_id, light_zone_id).
 */
export class EquipmentPostgres {
  constructor(private readonly pool: Pool) {}

  async list(userId: string): Promise<readonly EquipmentRow[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<EquipmentRow>(`select ${COLUMNS} from equipment order by lower(name)`),
    );
    return r.rows;
  }

  async create(
    userId: string,
    v: EquipmentValues,
    status: EquipmentStatus | null,
  ): Promise<EquipmentRow | "name_taken" | "zone_unknown"> {
    try {
      const r = await withAccount(this.pool, userId, (c) =>
        c.query<EquipmentRow>(
          `insert into equipment (account_id, type, name, status, manufacturer, model, product_id, price_eur, bought_at, note, light_zone_id)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10, $11) returning ${COLUMNS}`,
          [
            userId,
            v.type,
            v.name,
            status,
            v.manufacturer,
            v.model,
            v.productId,
            v.priceEur,
            v.boughtAt,
            v.note,
            v.lightZoneId,
          ],
        ),
      );
      return r.rows[0] as EquipmentRow;
    } catch (e) {
      return this.translate(e);
    }
  }

  private translate(e: unknown): "name_taken" | "zone_unknown" {
    const code = (e as { code?: string }).code;
    if (code === UNIQUE) return "name_taken";
    if (isZoneKey(e)) return "zone_unknown";
    throw e;
  }

  async setZone(
    userId: string,
    id: string,
    lightZoneId: string,
  ): Promise<ChangeResult<"not_lamp" | "zone_unknown">> {
    try {
      const r = await withAccount(this.pool, userId, async (c) => {
        const changed = await c.query<EquipmentRow>(
          `update equipment set light_zone_id = $2 where id = $1 and type = 'Lamp' returning ${COLUMNS}`,
          [id, lightZoneId],
        );
        if (changed.rows[0]) return changed.rows[0];
        const known = await c.query("select 1 from equipment where id = $1", [id]);
        return known.rowCount ? "not_lamp" : "not_found";
      });
      return r;
    } catch (e) {
      if (isZoneKey(e)) return "zone_unknown";
      throw e;
    }
  }

  async setStatus(
    userId: string,
    id: string,
    status: EquipmentStatus,
  ): Promise<ChangeResult<"no_status">> {
    return withAccount(this.pool, userId, async (c) => {
      const changed = await c.query<EquipmentRow>(
        `update equipment set status = $2 where id = $1 and status is not null returning ${COLUMNS}`,
        [id, status],
      );
      if (changed.rows[0]) return changed.rows[0];
      const known = await c.query("select 1 from equipment where id = $1", [id]);
      return known.rowCount ? "no_status" : "not_found";
    });
  }

  /** Sets power and light statement of a lamp; `null` clears a value back to unknown. */
  async setLampData(
    userId: string,
    id: string,
    data: { powerW: number | null; luxStatement: number | null },
  ): Promise<ChangeResult<"not_lamp">> {
    return withAccount(this.pool, userId, async (c) => {
      const changed = await c.query<EquipmentRow>(
        `update equipment set power_w = $2, lux_statement = $3 where id = $1 and type = 'Lamp' returning ${COLUMNS}`,
        [id, data.powerW, data.luxStatement],
      );
      if (changed.rows[0]) return changed.rows[0];
      const known = await c.query("select 1 from equipment where id = $1", [id]);
      return known.rowCount ? "not_lamp" : "not_found";
    });
  }

  /** Sets the operation data of a device (not of a consumable); `null` clears a value back to unknown. */
  async setMaintenance(
    userId: string,
    id: string,
    data: MaintenanceData,
  ): Promise<ChangeResult<"consumable">> {
    return withAccount(this.pool, userId, async (c) => {
      const changed = await c.query<EquipmentRow>(
        `update equipment set in_operation_since = $2::date, check_interval_days = $3, lifetime_value = $4,
           lifetime_source = $5 where id = $1 and status is not null returning ${COLUMNS}`,
        [
          id,
          data.inOperationSince,
          data.checkIntervalDays,
          data.lifetimeValue,
          data.lifetimeSource,
        ],
      );
      return changed.rows[0] ?? (await this.missing(c, id));
    });
  }

  /** Notes the date the keeper checked a device. */
  async markChecked(
    userId: string,
    id: string,
    checkedOn: string,
  ): Promise<ChangeResult<"consumable">> {
    return withAccount(this.pool, userId, async (c) => {
      const changed = await c.query<EquipmentRow>(
        `update equipment set last_checked_on = $2::date where id = $1 and status is not null returning ${COLUMNS}`,
        [id, checkedOn],
      );
      return changed.rows[0] ?? (await this.missing(c, id));
    });
  }

  /** Why an update on a device found nothing: no such record, or a consumable. */
  private async missing(c: PoolClient, id: string): Promise<"consumable" | "not_found"> {
    const known = await c.query("select 1 from equipment where id = $1", [id]);
    return known.rowCount ? "consumable" : "not_found";
  }

  /** The lamps of a zone, by name (usage source for "delete zone", port ZoneUsage in core). */
  async usingZone(userId: string, lightZoneId: string): Promise<readonly EquipmentRow[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<EquipmentRow>(
        `select ${COLUMNS} from equipment where light_zone_id = $1 order by lower(name), id`,
        [lightZoneId],
      ),
    );
    return r.rows;
  }
}
