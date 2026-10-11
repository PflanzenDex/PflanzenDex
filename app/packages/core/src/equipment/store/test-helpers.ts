import type {
  ChangeResult,
  EquipmentRow,
  EquipmentStatus,
  EquipmentStore,
  EquipmentValues,
  MaintenanceData,
  SupplyLevel,
} from "./types";

/** A valid UUID for the n-th record, as the operations expect. */
export const equipmentId = (n: number): string =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export { InMemoryLampLog } from "./lamp-log-helper";

/** In-memory adapter for tests only; the real adapter lives in `db`. */
export class InMemoryEquipment implements EquipmentStore {
  readonly rows: (EquipmentRow & { userId: string })[] = [];
  writes = 0;

  /** The light zones each account owns; a zone of another account is unknown (P-04). */
  constructor(
    private readonly zones: Readonly<Record<string, readonly string[]>> = {},
    /** The specimens and locations each account owns, for the assignment of sensors (US-EQU-06). */
    private readonly known: Readonly<
      Record<string, { specimens?: readonly string[]; locations?: readonly string[] }>
    > = {},
  ) {}

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
      inOperationSince: null,
      checkIntervalDays: null,
      lifetimeValue: null,
      lifetimeSource: null,
      lastCheckedOn: null,
      assignedSpecimenId: null,
      assignedLocationId: null,
      supply: status === null ? ("available" as const) : null,
      agentLink: null,
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

  private targetKnown(
    userId: string,
    target: { specimenId: string | null; locationId: string | null },
  ): boolean {
    const own = this.known[userId];
    const specimenOk = target.specimenId === null || !!own?.specimens?.includes(target.specimenId);
    const locationOk = target.locationId === null || !!own?.locations?.includes(target.locationId);
    return specimenOk && locationOk;
  }

  async setSensorTarget(
    userId: string,
    id: string,
    target: { specimenId: string | null; locationId: string | null },
  ): Promise<ChangeResult<"not_sensor" | "target_unknown">> {
    const row = this.own(userId, id);
    if (!row) return "not_found";
    if (row.type !== "Sensor") return "not_sensor";
    if (!this.targetKnown(userId, target)) return "target_unknown";
    return this.replace(row, {
      assignedSpecimenId: target.specimenId,
      assignedLocationId: target.locationId,
    });
  }

  async setSupply(
    userId: string,
    id: string,
    supply: SupplyLevel,
  ): Promise<ChangeResult<"not_consumable">> {
    const row = this.own(userId, id);
    if (!row) return "not_found";
    return row.supply === null ? "not_consumable" : this.replace(row, { supply });
  }

  async setAgentLink(
    userId: string,
    id: string,
    agentLink: string | null,
  ): Promise<ChangeResult<"not_plant_agent">> {
    const row = this.own(userId, id);
    if (!row) return "not_found";
    return row.type === "Plant agent" ? this.replace(row, { agentLink }) : "not_plant_agent";
  }

  async setMaintenance(
    userId: string,
    id: string,
    data: MaintenanceData,
  ): Promise<ChangeResult<"consumable">> {
    const row = this.own(userId, id);
    if (!row) return "not_found";
    return row.status === null ? "consumable" : this.replace(row, data);
  }

  async markChecked(
    userId: string,
    id: string,
    checkedOn: string,
  ): Promise<ChangeResult<"consumable">> {
    const row = this.own(userId, id);
    if (!row) return "not_found";
    return row.status === null ? "consumable" : this.replace(row, { lastCheckedOn: checkedOn });
  }

  async usingZone(userId: string, lightZoneId: string): Promise<readonly EquipmentRow[]> {
    return this.rows.filter((r) => r.userId === userId && r.lightZoneId === lightZoneId);
  }
}
