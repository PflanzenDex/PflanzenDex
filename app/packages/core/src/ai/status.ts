// The daily status for the AI client (US-KI-02): the same `todayStatus` as "Today" and the reminders (FR-MON-03), so
// the client can only phrase what the code computed (KI-R2). Read only, for the account of the connection (KI-R6).
import { appError, failed, ok, type Result } from "../kernel";
import type { TodayList } from "../today";
import { mayCall, type AiRights } from "./rights";

/** The central status function behind a port, so `ai` does not depend on the module `today`. */
export type StatusSource = (userId: string, timeZone: unknown) => Promise<Result<TodayList>>;

export interface AiLogRow {
  readonly id: string;
  readonly connectionId: string;
  readonly clientName: string;
  readonly operation: string;
  readonly effect: string;
  readonly createdAt: string;
  readonly undoneAt: string | null;
}

/** Port: the log of AI actions of the own account only (P-04). */
export interface AiLogStore {
  record(
    userId: string,
    entry: { connectionId: string; operation: string; effect: string },
    now: Date,
  ): Promise<void>;
  list(userId: string, limit: number): Promise<readonly AiLogRow[]>;
}

export interface StatusDependencies {
  readonly status: StatusSource;
  readonly log: AiLogStore;
}

export interface StatusCall {
  readonly userId: string;
  readonly connectionId: string;
  readonly rights: AiRights;
  readonly timeZone: unknown;
  readonly now: Date;
}

export const AI_LOG_LIMIT = 100;

/**
 * "What is due today?" for a connected client (US-KI-02): every item with its next action, none invented or left out.
 * The right is checked here again (KI-R8). Names and texts of items come from the keeper's own data and are data, not
 * instructions (KI-R9, `dataFields`). The call is logged (P-10, DM-KI-04) after it succeeded, with the count only.
 */
export async function aiStatus(
  deps: StatusDependencies,
  call: StatusCall,
): Promise<Result<TodayList & { readonly dataFields: readonly string[] }>> {
  if (!mayCall(call.rights, "status")) return failed(appError("ai.scope_insufficient"));
  const r = await deps.status(call.userId, call.timeZone);
  if (!r.ok) return r;
  await deps.log.record(
    call.userId,
    {
      connectionId: call.connectionId,
      operation: "status",
      effect: `read: ${r.value.items.length} items, ${r.value.upcoming} upcoming`,
    },
    call.now,
  );
  return ok({ ...r.value, dataFields: ["items[].text", "items[].specimenName"] });
}

/** The log of the account, newest first (US-KI-10). */
export const aiLog = (deps: Pick<StatusDependencies, "log">, userId: string) =>
  deps.log.list(userId, AI_LOG_LIMIT);
