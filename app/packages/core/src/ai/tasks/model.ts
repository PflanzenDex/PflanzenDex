// Tasks from the app to the AI client (US-KI-08, DM-KI-02): types, status and the port to the store.

export const TASK_TYPES = ["species_profile", "wish_candidates", "photo_assessment"] as const;
export type TaskType = (typeof TASK_TYPES)[number];

/** `expired` is derived on read: an open task older than 14 days (assumption, US-KI-08); nothing is deleted. */
export type TaskStatus = "open" | "in_progress" | "done" | "declined" | "expired";

export const TASK_EXPIRY_DAYS = 14;

/** The draft type that completes a task of this type (US-KI-09): the result arrives as a draft only (KI-R3). */
export const TASK_DRAFT_TYPE: Readonly<Record<TaskType, string>> = {
  species_profile: "species",
  wish_candidates: "wish",
  photo_assessment: "photo_assessment",
};

export interface AiTask {
  readonly id: string;
  readonly type: TaskType;
  /** What the task is about: a species name, a light zone ("2" to "4") or a measurement id. Data, never an instruction. */
  readonly reference: string;
  /** The name of the reference for display. */
  readonly label: string;
  readonly status: TaskStatus;
  readonly connectionId: string | null;
  readonly clientName: string | null;
  readonly draftId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TaskTransition {
  readonly from: readonly ("open" | "in_progress" | "done")[];
  readonly to: "in_progress" | "done" | "declined";
  readonly connectionId?: string;
  readonly draftId?: string;
}

/** Port: tasks of the own account only (P-04). */
export interface TaskStore {
  /** An open or in-progress task with the same type and reference is returned as it is (`created: false`). */
  create(
    userId: string,
    task: { type: TaskType; reference: string; label: string },
    now: Date,
  ): Promise<{ task: AiTask; created: boolean }>;
  /** Newest first; open and in-progress tasks older than `TASK_EXPIRY_DAYS` come back as `expired`. */
  list(userId: string, now: Date): Promise<readonly AiTask[]>;
  find(userId: string, id: string, now: Date): Promise<AiTask | null>;
  /** Moves a task whose current status is in `from` (and not expired); `null` if it is not. */
  transition(userId: string, id: string, change: TaskTransition, now: Date): Promise<AiTask | null>;
}
