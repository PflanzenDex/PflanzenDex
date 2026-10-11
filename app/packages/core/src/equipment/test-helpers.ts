import type { EquipmentRow, EquipmentStatus, EquipmentStore, EquipmentValues } from "./types";

/** In-memory adapter for tests only; the real adapter lives in `db`. */
export class InMemoryEquipment implements EquipmentStore {
  readonly rows: (EquipmentRow & { userId: string })[] = [];
  writes = 0;

  async list(userId: string): Promise<readonly EquipmentRow[]> {
    return this.rows.filter((r) => r.userId === userId);
  }

  async create(
    userId: string,
    values: EquipmentValues,
    status: EquipmentStatus | null,
  ): Promise<EquipmentRow | "name_taken"> {
    this.writes += 1;
    const key = values.name.toLowerCase();
    if (this.rows.some((r) => r.userId === userId && r.name.toLowerCase() === key))
      return "name_taken";
    const row = { ...values, status, id: `e${this.rows.length + 1}`, userId };
    this.rows.push(row);
    return row;
  }
}
