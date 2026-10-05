// Treatments (US-BEH-01, DM-BEH-01). Ports for persistence; adapters live in `db` (AB-1).

/** Limits are assumptions (starting values); the database checks the same values for text. */
export const TREATMENT_LIMITS = {
  reason: { min: 1, max: 200 },
  agent: { min: 1, max: 200 },
  /** Most specimens one call takes. */
  specimens: 50,
  /** N dates of a course (default 3, US-BEH-01). */
  courseCount: { min: 1, max: 20 },
  /** T days between two dates of a course (default 7, US-BEH-01). */
  courseInterval: { min: 1, max: 365 },
} as const;

export const COURSE_DEFAULTS = { count: 3, intervalDays: 7 } as const;

/** What is stored (DM-BEH-01). Status, due text and sorting are derived (P-01). */
export interface TreatmentRow {
  readonly id: string;
  readonly specimenId: string;
  readonly reason: string;
  /** Free text; a reference to equipment follows with US-EQU-05. `null` = no agent given. */
  readonly agent: string | null;
  /** Local calendar date `YYYY-MM-DD` (NFR-08). */
  readonly dueAt: string;
  readonly done: boolean;
  /** Local calendar date the treatment was ticked off (US-BEH-03); `null` while open. */
  readonly doneAt: string | null;
  /** Shared by the dates of one course of one specimen; `null` for a single treatment. */
  readonly courseId: string | null;
}

export type TreatmentValues = Pick<
  TreatmentRow,
  "specimenId" | "reason" | "agent" | "dueAt" | "courseId"
>;

/** Every call applies to the account `userId` only (P-04). */
export interface TreatmentStore {
  /** All or nothing; a specimen of another account counts as unknown and writes nothing. */
  createMany(
    userId: string,
    values: readonly TreatmentValues[],
  ): Promise<readonly TreatmentRow[] | "specimen_unknown">;
  /** Open (not done) treatments of the named specimens of the account; specimens without one are missing. */
  open(
    userId: string,
    specimenIds: readonly string[],
  ): Promise<ReadonlyMap<string, readonly TreatmentRow[]>>;
  /** One treatment of the account by its ID (FR-BEH-02); a foreign or unknown one is `null` (P-04). */
  find(userId: string, id: string): Promise<TreatmentRow | null>;
  /**
   * Ticks a treatment off with the local date `doneAt` (US-BEH-03). Idempotent: an already done treatment is returned
   * unchanged and keeps its first done date. `"unknown"` for a foreign or unknown ID.
   */
  complete(userId: string, id: string, doneAt: string): Promise<TreatmentRow | "unknown">;
  /** Done treatments of one specimen of the account, latest done date first (history, US-BEH-03). */
  done(userId: string, specimenId: string): Promise<readonly TreatmentRow[]>;
}
