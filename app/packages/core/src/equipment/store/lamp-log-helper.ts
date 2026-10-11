import { equipmentId, type InMemoryEquipment } from "./test-helpers";
import type {
  DeviationLimitStore,
  LampMeasurement,
  LampMeasurementStore,
  LampMeasurementValues,
} from "../lamps/measurements/types";

/** In-memory measurement log and deviation limit for tests only; the real adapters live in `db`. */
export class InMemoryLampLog implements LampMeasurementStore, DeviationLimitStore {
  readonly rows: (LampMeasurement & { userId: string })[] = [];
  private readonly limits = new Map<string, number | null>();

  constructor(private readonly equipment: InMemoryEquipment) {}

  async add(
    userId: string,
    values: LampMeasurementValues,
  ): Promise<LampMeasurement | "not_found" | "not_lamp"> {
    const lamp = this.equipment.rows.find(
      (r) => r.userId === userId && r.id === values.equipmentId,
    );
    if (!lamp) return "not_found";
    if (lamp.type !== "Lamp") return "not_lamp";
    const row = { ...values, id: equipmentId(1000 + this.rows.length), userId };
    this.rows.push(row);
    return row;
  }

  /** Newest date first; of the same date the later entry first. */
  async list(userId: string): Promise<readonly LampMeasurement[]> {
    return this.rows
      .filter((r) => r.userId === userId)
      .map((r, i) => ({ r, i }))
      .sort((a, b) => b.r.measuredOn.localeCompare(a.r.measuredOn) || b.i - a.i)
      .map(({ r }) => r);
  }

  async limit(userId: string): Promise<number | null> {
    return this.limits.get(userId) ?? null;
  }

  async setLimit(userId: string, percent: number | null): Promise<number | null> {
    this.limits.set(userId, percent);
    return percent;
  }
}
