import type { TreatmentRow, TreatmentStore, TreatmentValues } from "./treatment-types";

const bare = ({ userId: owner, ...row }: TreatmentRow & { userId: string }): TreatmentRow => {
  void owner;
  return row;
};

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

  async find(userId: string, id: string): Promise<TreatmentRow | null> {
    const found = this.rows.find((r) => r.userId === userId && r.id === id);
    return found ? bare(found) : null;
  }

  async complete(userId: string, id: string, doneAt: string): Promise<TreatmentRow | "unknown"> {
    this.writes += 1;
    const index = this.rows.findIndex((r) => r.userId === userId && r.id === id);
    const found = this.rows[index];
    if (!found) return "unknown";
    if (!found.done) this.rows[index] = { ...found, done: true, doneAt };
    return bare(this.rows[index] as typeof found);
  }

  async done(userId: string, specimenId: string): Promise<readonly TreatmentRow[]> {
    return this.rows
      .filter((r) => r.userId === userId && r.specimenId === specimenId && r.done)
      .map(bare)
      .sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? "") || a.id.localeCompare(b.id));
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
