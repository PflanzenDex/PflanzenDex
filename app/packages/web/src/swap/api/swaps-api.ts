import type { HistoryEntry, SwapAction, SwapOverview } from "@pflanzendex/core";
import { call, createWrite, currentTimeZone, type Response } from "../../kernel";

type FetchFn = typeof fetch;

/** Loads my side of every swap (US-SOZ-10); a swap behind an ended friendship is already canceled by the server. */
export function loadSwaps(
  api: string,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<SwapOverview>> {
  return call<SwapOverview>(fetchFn, `${api}/swaps`, token);
}

export interface AnswerInput {
  action: SwapAction;
  reason?: string;
  proposal?: string;
}

/** Answers or changes a swap (US-SOZ-10); the repeat-guard key is created per call. */
export async function answerSwap(
  access: { api: string; token: string; fetchFn?: FetchFn },
  swapId: string,
  input: AnswerInput,
): Promise<Response<{ status: string }>> {
  const r = await createWrite(access.api, access.token, access.fetchFn ?? fetch)(
    "POST",
    `/swaps/${encodeURIComponent(swapId)}/answer`,
    input,
  );
  return r.ok ? { ok: true, value: r.value as { status: string } } : r;
}

/** Confirms the handover (US-SOZ-11) with the keeper's time zone for the local date; `marker` only for the recipient. */
export async function confirmHandover(
  access: { api: string; token: string; fetchFn?: FetchFn },
  swapId: string,
  marker: string | null,
): Promise<Response<{ status: "waiting" | "handed_over" }>> {
  const r = await createWrite(access.api, access.token, access.fetchFn ?? fetch)(
    "POST",
    `/swaps/${encodeURIComponent(swapId)}/handover`,
    { timeZone: currentTimeZone(), ...(marker ? { marker } : {}) },
  );
  return r.ok ? { ok: true, value: r.value as { status: "waiting" | "handed_over" } } : r;
}

/** Loads the swap history (US-SOZ-13): finished swaps, newest first. */
export function loadHistory(
  api: string,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<{ entries: readonly HistoryEntry[] }>> {
  return call<{ entries: readonly HistoryEntry[] }>(fetchFn, `${api}/swaps/history`, token);
}
