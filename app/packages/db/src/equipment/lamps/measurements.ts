import type { Pool } from "pg";
import { withAccount } from "../../kernel/index.ts";

// The shapes are the types of `core` (type-only import through its public entry, AB-2).
import type { LampMeasurement, LampMeasurementValues } from "@pflanzendex/core";

const COLUMNS = `id, equipment_id as "equipmentId", to_char(measured_on, 'YYYY-MM-DD') as "measuredOn", lux,
  distance_cm as "distanceCm", method`;

/** Adapter for the measurement log of the lamps; append-only, under the row rules of the account (P-04). */
export class LampMeasurementsPostgres {
  constructor(private readonly pool: Pool) {}

  async add(
    userId: string,
    v: LampMeasurementValues,
  ): Promise<LampMeasurement | "not_found" | "not_lamp"> {
    return withAccount(this.pool, userId, async (c) => {
      const lamp = await c.query<{ type: string }>("select type from equipment where id = $1", [
        v.equipmentId,
      ]);
      if (!lamp.rows[0]) return "not_found";
      if (lamp.rows[0].type !== "Lamp") return "not_lamp";
      const r = await c.query<LampMeasurement>(
        `insert into lamp_measurement (account_id, equipment_id, measured_on, lux, distance_cm, method)
         values ($1, $2, $3::date, $4, $5, $6) returning ${COLUMNS}`,
        [userId, v.equipmentId, v.measuredOn, v.lux, v.distanceCm, v.method],
      );
      return r.rows[0] as LampMeasurement;
    });
  }

  /** All measurements of the account, the newest date first; of the same date the later entry first. */
  async list(userId: string): Promise<readonly LampMeasurement[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<LampMeasurement>(
        `select ${COLUMNS} from lamp_measurement order by measured_on desc, created_at desc, id`,
      ),
    );
    return r.rows;
  }
}
