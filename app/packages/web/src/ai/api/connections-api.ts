import type { AiConnection, AiRights } from "@pflanzendex/core";
import { call, createWrite, type Response } from "../../kernel";

type FetchFn = typeof fetch;

/** The connected AI clients of the own account, newest first, revoked ones included (US-KI-07). */
export async function loadConnections(
  api: string,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<readonly AiConnection[]>> {
  const r = await call<{ connections: readonly AiConnection[] }>(
    fetchFn,
    `${api}/ai/connections`,
    token,
  );
  return r.ok ? { ok: true, value: r.value.connections } : r;
}

export const setRights = (api: string, token: string, id: string, rights: AiRights) =>
  createWrite(api, token)("PUT", `/ai/connections/${id}/rights`, { rights });

export const revokeConnection = (api: string, token: string, id: string) =>
  createWrite(api, token)("POST", `/ai/connections/${id}/revoke`);

export const allowAgain = (api: string, token: string, id: string) =>
  createWrite(api, token)("POST", `/ai/connections/${id}/allow-again`);

export interface AiDraftRow {
  readonly id: string;
  readonly clientName: string;
  readonly type: string;
  readonly content: unknown;
  readonly source: string;
  readonly status: "open" | "adopted" | "discarded" | "expired";
  readonly createdAt: string;
}

/** The drafts of the own account, newest first, also adopted, discarded and expired ones (US-KI-09). */
export async function loadDrafts(
  api: string,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<readonly AiDraftRow[]>> {
  const r = await call<{ drafts: readonly AiDraftRow[] }>(fetchFn, `${api}/ai/drafts`, token);
  return r.ok ? { ok: true, value: r.value.drafts } : r;
}

export const adoptDraft = (api: string, token: string, id: string) =>
  createWrite(api, token)("POST", `/ai/drafts/${id}/adopt`);

export const discardDraft = (api: string, token: string, id: string) =>
  createWrite(api, token)("POST", `/ai/drafts/${id}/discard`);

export type AiTaskType = "species_profile" | "wish_candidates" | "photo_assessment";

export interface AiTaskRow {
  readonly id: string;
  readonly type: AiTaskType;
  readonly title: string;
  readonly reference: string;
  readonly label: string;
  readonly status: "open" | "in_progress" | "done" | "declined" | "expired";
  readonly clientName: string | null;
  readonly createdAt: string;
  /** The ready-made prompt for open and in-progress tasks (US-KI-08), else `null`. */
  readonly prompt: string | null;
}

/** The tasks to the AI client with the status and whether a client is connected (US-KI-08). */
export async function loadTasks(
  api: string,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<{ clientConnected: boolean; tasks: readonly AiTaskRow[] }>> {
  return call(fetchFn, `${api}/ai/tasks`, token);
}

export const createTask = (api: string, token: string, type: AiTaskType, reference: string) =>
  createWrite(api, token)("POST", "/ai/tasks", { type, reference });

export const previewTask = (api: string, token: string, type: AiTaskType, reference: string) =>
  call<{ prompt: string }>(fetch, `${api}/ai/tasks/preview`, token, {
    method: "POST",
    body: { type, reference },
    key: crypto.randomUUID(),
  });

export const cancelTask = (api: string, token: string, id: string) =>
  createWrite(api, token)("POST", `/ai/tasks/${id}/cancel`);
