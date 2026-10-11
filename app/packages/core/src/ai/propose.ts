// Delivering a draft from the AI client (US-KI-09, US-KI-08): checks right, type, source, content and task, then stores.
import {
  appError,
  canonical,
  failed,
  idField,
  ok,
  orNull,
  shape,
  textField,
  type Result,
} from "../kernel";
import type { AiDraft, DraftDependencies } from "./drafts";
import { mayCall, type AiRights } from "./rights";
import type { AiLogStore } from "./status";
import { TASK_DRAFT_TYPE, type AiTask, type TaskStore } from "./tasks/model";

export interface ProposeCall {
  readonly userId: string;
  readonly connectionId: string;
  readonly rights: AiRights;
  readonly input: unknown;
  readonly now: Date;
}

const envelope = shape({
  type: textField("type", { min: 1, max: 50 }),
  reference: orNull(textField("reference", { min: 1, max: 200 })),
  source: textField("source", { min: 1, max: 1000 }),
  taskId: orNull(idField("taskId")),
});

const invalid = (field: string) =>
  failed(appError("input.invalid", { details: [{ field, code: "input.invalid" }] }));

/**
 * The task a draft belongs to (US-KI-08): the account's own, of the matching type and still to do; a finished task takes
 * further drafts only from the connection that finished it (several wish candidates). `null` without a task id.
 */
async function taskOf(
  tasks: TaskStore | undefined,
  call: ProposeCall,
  draftType: string,
  taskId: string | null,
): Promise<Result<AiTask | null>> {
  if (!taskId) return ok(null);
  const task = (await tasks?.find(call.userId, taskId, call.now)) ?? null;
  if (!task) return failed(appError("ai.task_not_found"));
  if (TASK_DRAFT_TYPE[task.type] !== draftType) return invalid("taskId");
  const todo = task.status === "open" || task.status === "in_progress";
  const mine = task.status === "done" && task.connectionId === call.connectionId;
  return todo || mine ? ok(task) : failed(appError("ai.task_closed"));
}

/** The first draft of a task completes it and is linked to it (US-KI-08); later drafts leave it as it is. */
async function completeTask(
  tasks: TaskStore | undefined,
  call: ProposeCall,
  task: AiTask | null,
  draftId: string,
): Promise<void> {
  if (!task || task.status === "done") return;
  const change = {
    from: ["open", "in_progress"],
    to: "done",
    connectionId: call.connectionId,
    draftId,
  } as const;
  await tasks?.transition(call.userId, task.id, change, call.now);
}

/**
 * Stores a draft from the client (KI-R3, KI-R8): the right "create drafts" is checked here again, the type must be
 * known, the source is mandatory, and the content must pass the schema of the target operation, otherwise nothing is
 * stored and the refusal names the fields. With a task id the first draft completes the task. The call is logged with
 * type only (P-10).
 */
export async function aiProposeDraft(
  deps: DraftDependencies & { readonly log: AiLogStore; readonly tasks?: TaskStore },
  call: ProposeCall,
): Promise<Result<{ draft: AiDraft; created: boolean }>> {
  if (!mayCall(call.rights, "propose_draft")) return failed(appError("ai.scope_insufficient"));
  const input = (call.input ?? {}) as Record<string, unknown>;
  const head = envelope(input);
  if (!head.ok) return head;
  const type = deps.types[head.value.type];
  if (!type) return invalid("type");
  const content = type.schema(input["content"]);
  if (!content.ok) return content;
  const task = await taskOf(deps.tasks, call, head.value.type, head.value.taskId);
  if (!task.ok) return task;
  const stored = await deps.drafts.create(
    call.userId,
    {
      connectionId: call.connectionId,
      type: head.value.type,
      reference: head.value.reference,
      // The raw content is stored: the schema only checks it, adopting runs the operation on the same input as the form.
      content: input["content"],
      contentKey: canonical(input["content"]),
      source: head.value.source,
    },
    call.now,
  );
  await completeTask(deps.tasks, call, task.value, stored.draft.id);
  const effect = `draft: ${head.value.type}${stored.created ? "" : " (already open)"}${task.value ? " for a task" : ""}`;
  await deps.log.record(
    call.userId,
    { connectionId: call.connectionId, operation: "propose_draft", effect },
    call.now,
  );
  return ok(stored);
}
