import type { SwapAction, SwapOverview } from "@pflanzendex/core";
import { call, createWrite, type Response } from "../../kernel";

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
