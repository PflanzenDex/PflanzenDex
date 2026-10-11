import { randomUUID } from "node:crypto";
import type { Fixtures } from "../kernel/index.ts";

// Tables of the `equipment` module (FR-QG-07).
export const FIXTURES_EQUIPMENT: Fixtures = {
  equipment: () => ({ type: "Lamp", name: "Lampe 3", status: "active" }),
  // A measurement belongs to a lamp of the same account.
  lamp_measurement: async (k) => {
    const r = await k.query.query<{ id: string }>(
      "insert into equipment (account_id, type, name, status) values ($1, 'Lamp', $2, 'active') returning id",
      [k.accountId, `Messlampe ${randomUUID()}`],
    );
    return {
      equipment_id: (r.rows[0] as { id: string }).id,
      measured_on: "2026-10-01",
      lux: 12000,
    };
  },
  equipment_setting: () => ({ deviation_percent: 20 }),
};
