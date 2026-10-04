import type { Pool } from "pg";

// Same shapes as the interfaces in `core` (structurally equal; `db` does not import `core`).
export interface TreatmentRow {
  readonly id: string;
  readonly specimenId: string;
  readonly reason: string;
  readonly agent: string | null;
  readonly dueAt: string;
  readonly done: boolean;
  readonly doneAt: string | null;
  readonly courseId: string | null;
}
export type TreatmentValues = Pick<
  TreatmentRow,
  "specimenId" | "reason" | "agent" | "dueAt" | "courseId"
>;

/** Placeholder: implemented after the red tests. */
export class TreatmentsPostgres {
  constructor(private readonly pool: Pool) {}

  async createMany(
    userId: string,
    values: readonly TreatmentValues[],
  ): Promise<readonly TreatmentRow[] | "specimen_unknown"> {
    void [this.pool, userId, values];
    return [];
  }

  async open(
    userId: string,
    specimenIds: readonly string[],
  ): Promise<ReadonlyMap<string, readonly TreatmentRow[]>> {
    void [this.pool, userId, specimenIds];
    return new Map();
  }
}
