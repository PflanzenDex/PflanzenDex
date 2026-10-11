import type {
  ChangeResult,
  EquipmentRow,
  EquipmentStatus,
  EquipmentStore,
  EquipmentValues,
} from "./types";
import type {
  DeviationLimitStore,
  LampMeasurement,
  LampMeasurementStore,
  LampMeasurementValues,
} from "../lamps/measurements/types";

/** A valid UUID for the n-th record, as the operations expect. */
export const equipmentId = (n: number): string =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** In-memory adapter for tests only; the real adapter lives in `db`. */
export class InMemoryEquipment implements EquipmentStore {
  readonly rows: (EquipmentRow & { userId: string })[] = [];
  writes = 0;

  /** The light zones each account owns; a zone of another account is unknown (P-04). */
  constructor(private readonly zones: Readonly<Record<string, readonly string[]>> = {}) {}

  async list(userId: string): Promise<readonly EquipmentRow[]> {
    return this.rows.filter((r) => r.userId === userId);
  }

  async create(
    userId: string,
    values: EquipmentValues,
    status: EquipmentStatus | null,
  ): Promise<EquipmentRow | "name_taken" | "zone_unknown"> {
    this.writes += 1;
    if (values.lightZoneId !== null && !this.zones[userId]?.includes(values.lightZoneId))
      return "zone_unknown";
    const key = values.name.toLowerCase();
    if (this.rows.some((r) => r.userId === userId && r.name.toLowerCase() === key))
      return "name_taken";
    const row = {
      ...values,
      status,
      powerW: null,
      luxStatement: null,
      id: equipmentId(this.rows.length + 1),
      userId,
    };
    this.rows.push(row);
    return row;
  }

  private own(userId: string, id: string) {
    return this.rows.find((r) => r.userId === userId && r.id === id);
  }

  private replace(row: EquipmentRow & { userId: string }, change: Partial<EquipmentRow>) {
    this.writes += 1;
    const next = { ...row, ...change };
    this.rows[this.rows.indexOf(row)] = next;
    return next;
  }

  async setZone(
    userId: string,
    id: string,
    lightZoneId: string,
  ): Promise<ChangeResult<"not_lamp" | "zone_unknown">> {
    const row = this.own(userId, id);
    if (!row) return "not_found";
    if (row.type !== "Lamp") return "not_lamp";
    if (!this.zones[userId]?.includes(lightZoneId)) return "zone_unknown";
    return this.replace(row, { lightZoneId });
  }

  async setStatus(
    userId: string,
    id: string,
    status: EquipmentStatus,
  ): Promise<ChangeResult<"no_status">> {
    const row = this.own(userId, id);
    if (!row) return "not_found";
    return row.status === null ? "no_status" : this.replace(row, { status });
  }

  async setLampData(
    userId: string,
    id: string,
    data: { powerW: number | null; luxStatement: number | null },
  ): Promise<ChangeResult<"not_lamp">> {
    const row = this.own(userId, id);
    if (!row) return "not_found";
    return row.type === "Lamp" ? this.replace(row, data) : "not_lamp";
  }

  async usingZone(userId: string, lightZoneId: string): Promise<readonly EquipmentRow[]> {
    return this.rows.filter((r) => r.userId === userId && r.lightZoneId === lightZoneId);
  }
}

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
