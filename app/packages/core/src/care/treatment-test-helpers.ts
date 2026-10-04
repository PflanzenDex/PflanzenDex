import type { TreatmentRow, TreatmentStore, TreatmentValues } from "./treatment-types";

/** In-memory adapter for tests only; the real adapter lives in `db`. */
export class InMemoryTreatments implements TreatmentStore {
  readonly rows: (TreatmentRow & { userId: string })[] = [];
  writes = 0;

  constructor(private readonly ownership: Readonly<Record<string, readonly string[]>>) {}

  async createMany(
    userId: string,
    values: readonly TreatmentValues[],
  ): Promise<readonly TreatmentRow[] | "specimen_unknown"> {
    this.writes += 1;
    if (values.some((v) => !this.ownership[userId]?.includes(v.specimenId)))
      return "specimen_unknown";
    const created = values.map((v, i): TreatmentRow => ({
      ...v,
      id: `t${this.rows.length + i + 1}`,
      done: false,
      doneAt: null,
    }));
    this.rows.push(...created.map((row) => ({ ...row, userId })));
    return created;
  }

  async open(
    userId: string,
    specimenIds: readonly string[],
  ): Promise<ReadonlyMap<string, readonly TreatmentRow[]>> {
    const result = new Map<string, TreatmentRow[]>();
    for (const { userId: owner, ...row } of this.rows) {
      if (owner !== userId || row.done || !specimenIds.includes(row.specimenId)) continue;
      result.set(row.specimenId, [...(result.get(row.specimenId) ?? []), row]);
    }
    return result;
  }
}
