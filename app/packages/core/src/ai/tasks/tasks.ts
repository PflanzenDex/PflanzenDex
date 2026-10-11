// Tasks from the app to the AI client (US-KI-08, DM-KI-02): the keeper triggers a task, the connected client picks it
// up and delivers the result as a draft (US-KI-09). The task only says what to do; the client judges, the code writes
// after the keeper adopts the draft (P-01, P-03, KI-R3).
import {
  appError,
  choiceField,
  defineOperation,
  failed,
  idField,
  ok,
  orNull,
  shape,
  textField,
  type Result,
} from "../../kernel";
import type { ConnectionStore } from "../connection";
import { rankOf } from "../rights";
import { TASK_TYPES, type AiTask, type TaskStore, type TaskType } from "./model";

export interface TaskDependencies {
  readonly tasks: TaskStore;
  readonly connections: ConnectionStore;
}

const invalid = (field: string) =>
  failed(appError("input.invalid", { details: [{ field, code: "input.invalid" }] }));

const taskInput = shape({
  type: choiceField("type", TASK_TYPES),
  reference: textField("reference", { min: 1, max: 200 }),
  label: orNull(textField("label", { min: 1, max: 100 })),
});

const ID = idField("reference");
const ZONES = ["2", "3", "4"] as const;

/** Checks the reference per type and names it for display: a species, a light zone 2 to 4 or a measurement. */
export function taskReference(
  type: TaskType,
  reference: string,
  label: string | null,
): Result<{ reference: string; label: string }> {
  if (type === "species_profile") return ok({ reference, label: reference });
  if (type === "wish_candidates") {
    const zone = choiceField("reference", ZONES)(reference);
    return typeof zone === "string"
      ? ok({ reference, label: `Lichtzone ${zone}` })
      : invalid("reference");
  }
  return typeof ID(reference) === "string"
    ? ok({ reference, label: label ?? reference })
    : invalid("reference");
}

const validTask = (input: unknown) => {
  const r = taskInput(input);
  if (!r.ok) return r;
  const ref = taskReference(r.value.type, r.value.reference, r.value.label);
  return ref.ok ? ok({ type: r.value.type, ...ref.value }) : ref;
};

/** Whether a client with the right to create drafts is connected (US-KI-08: otherwise no task is created). */
export async function clientConnected(deps: Pick<TaskDependencies, "connections">, userId: string) {
  const all = await deps.connections.list(userId);
  return all.some((c) => !c.revokedAt && rankOf(c.rights) >= rankOf("drafts"));
}

/** What a task would say, for "Copy task as text" without a connected client: nothing is stored (P-10). */
export const aiTaskPreview = defineOperation({
  name: "ai.task_preview",
  schema: validTask,
  run: async (_ctx, input) => ok(input),
});

/**
 * Creates a task for the connected client (US-KI-08). Without a connected client no task is stored (`ai.no_client`,
 * P-10: no silent task that is never processed). A task for the same type and reference that is still open or in
 * progress is returned instead of a second one, so repeating is idempotent (US-QS-03).
 */
export const aiCreateTask = (deps: TaskDependencies, now: () => Date = () => new Date()) =>
  defineOperation({
    name: "ai.create_task",
    schema: validTask,
    run: async ({ userId }, input) => {
      if (!(await clientConnected(deps, userId))) return failed(appError("ai.no_client"));
      return ok(await deps.tasks.create(userId, input, now()));
    },
  });

/** The tasks of the account, newest first, with whether a client is connected (US-KI-08: the app shows the status). */
export async function aiTasks(deps: TaskDependencies, userId: string, now: Date) {
  return {
    tasks: await deps.tasks.list(userId, now),
    clientConnected: await clientConnected(deps, userId),
  };
}

const idOnly = shape({ id: idField("id") });

/** Moves an unfinished task to `declined`; `ai.task_closed` if it is finished, `ai.task_not_found` if it is not the account's. */
export async function declineTask(
  tasks: TaskStore,
  who: { userId: string; id: string; now: Date },
  connectionId?: string,
): Promise<Result<AiTask>> {
  const from = ["open", "in_progress"] as const;
  const change = { from, to: "declined", ...(connectionId ? { connectionId } : {}) } as const;
  const moved = await tasks.transition(who.userId, who.id, change, who.now);
  if (moved) return ok(moved);
  const known = await tasks.find(who.userId, who.id, who.now);
  return failed(appError(known ? "ai.task_closed" : "ai.task_not_found"));
}

/** The keeper withdraws a task that is not finished; it stays visible as declined (P-10). */
export const aiCancelTask = (
  deps: Pick<TaskDependencies, "tasks">,
  now: () => Date = () => new Date(),
) =>
  defineOperation({
    name: "ai.cancel_task",
    schema: idOnly,
    run: async ({ userId }, input) => declineTask(deps.tasks, { userId, id: input.id, now: now() }),
  });
