import type { MergeOutcome, ReviewCase, ReviewList } from "@pflanzendex/core";
import { call, type Response, type WriteOptions, writeFor } from "../../shared/data";

type FetchFn = typeof fetch;

/** The review list for operators and reviewers (US-BES-10); a plant keeper gets `access.denied`. */
export function loadReviewList(
  api: string,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<ReviewList>> {
  return call<ReviewList>(fetchFn, `${api}/review`, token);
}

export type Decision = { caseId: string } & (
  { status: "reviewed" } | { status: "rejected"; reason: string }
);

/** Approve or reject (with the reason the creator will see); the repeat-guard key is the action's (`options.key`), else made per call. */
export async function decideProposal(
  api: string,
  token: string,
  { caseId, ...decision }: Decision,
  options: WriteOptions = {},
): Promise<Response<ReviewCase>> {
  const r = await writeFor(api, token, options)("POST", `/review/${caseId}/decide`, decision);
  return r.ok ? { ok: true, value: r.value as ReviewCase } : r;
}

/** Folds a proposal into an existing species; the answer says what was moved (P-10). */
export async function mergeProposal(
  api: string,
  token: string,
  { caseId, targetSpeciesId }: { caseId: string; targetSpeciesId: string },
  options: WriteOptions = {},
): Promise<Response<MergeOutcome>> {
  const r = await writeFor(api, token, options)("POST", `/review/${caseId}/merge`, {
    targetSpeciesId,
  });
  return r.ok ? { ok: true, value: r.value as MergeOutcome } : r;
}
