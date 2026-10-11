// The AI client's side of tasks (US-KI-08): list open tasks, take one over, decline one. Rights are checked again here
// (KI-R8); every call is logged without content (P-10).
import { appError, failed, ok, type Result } from "../../kernel";
import { mayCall, type AiRights } from "../rights";
import type { AiLogStore } from "../status";
import type { AiTask } from "./model";
import { declineTask, type TaskDependencies } from "./tasks";

export interface ClientTaskCall {
  readonly userId: string;
  readonly connectionId: string;
  readonly rights: AiRights;
  readonly now: Date;
}

/** The open tasks for the connected client (read right, KI-R8); the call is logged with the count only. */
export async function aiClientTasks(
  deps: Pick<TaskDependencies, "tasks"> & { readonly log: AiLogStore },
  call: ClientTaskCall,
): Promise<Result<{ tasks: readonly AiTask[]; dataFields: readonly string[] }>> {
  if (!mayCall(call.rights, "list_tasks")) return failed(appError("ai.scope_insufficient"));
  const mine = (await deps.tasks.list(call.userId, call.now)).filter(
    (t) =>
      t.status === "open" || (t.status === "in_progress" && t.connectionId === call.connectionId),
  );
  await deps.log.record(
    call.userId,
    {
      connectionId: call.connectionId,
      operation: "list_tasks",
      effect: `read: ${mine.length} tasks`,
    },
    call.now,
  );
  return ok({ tasks: mine, dataFields: ["tasks[].reference", "tasks[].label"] });
}

/** The client takes over an open task (`open → in progress`); repeating it with the same connection changes nothing. */
export async function aiClaimTask(
  deps: Pick<TaskDependencies, "tasks"> & { readonly log: AiLogStore },
  call: ClientTaskCall & { readonly id: string },
): Promise<Result<AiTask>> {
  if (!mayCall(call.rights, "claim_task")) return failed(appError("ai.scope_insufficient"));
  const known = await deps.tasks.find(call.userId, call.id, call.now);
  if (!known) return failed(appError("ai.task_not_found"));
  if (known.status === "in_progress" && known.connectionId === call.connectionId) return ok(known);
  const moved = await deps.tasks.transition(
    call.userId,
    call.id,
    { from: ["open"], to: "in_progress", connectionId: call.connectionId },
    call.now,
  );
  if (!moved) return failed(appError("ai.task_closed"));
  await deps.log.record(
    call.userId,
    { connectionId: call.connectionId, operation: "claim_task", effect: `task: ${moved.type}` },
    call.now,
  );
  return ok(moved);
}

/** The client declines a task it cannot do; it stays visible as declined (P-10). */
export async function aiDeclineClientTask(
  deps: Pick<TaskDependencies, "tasks"> & { readonly log: AiLogStore },
  call: ClientTaskCall & { readonly id: string },
): Promise<Result<AiTask>> {
  if (!mayCall(call.rights, "decline_task")) return failed(appError("ai.scope_insufficient"));
  const r = await declineTask(deps.tasks, call, call.connectionId);
  if (r.ok)
    await deps.log.record(
      call.userId,
      {
        connectionId: call.connectionId,
        operation: "decline_task",
        effect: `task: ${r.value.type}`,
      },
      call.now,
    );
  return r;
}
