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
