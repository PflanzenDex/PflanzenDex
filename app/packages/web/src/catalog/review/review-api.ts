import type { MergeOutcome, ReviewCase, ReviewList } from "@pflanzendex/core";
import { call, createWrite, type Response } from "../../kernel";

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

/** Approve or reject (with the reason the creator will see); the repeat-guard key is created per call. */
export async function decideProposal(
  api: string,
  token: string,
  { caseId, ...decision }: Decision,
  fetchFn: FetchFn = fetch,
): Promise<Response<ReviewCase>> {
  const r = await createWrite(api, token, fetchFn)("POST", `/review/${caseId}/decide`, decision);
  return r.ok ? { ok: true, value: r.value as ReviewCase } : r;
}

/** Folds a proposal into an existing species; the answer says what was moved (P-10). */
export async function mergeProposal(
  api: string,
  token: string,
  { caseId, targetSpeciesId }: { caseId: string; targetSpeciesId: string },
  fetchFn: FetchFn = fetch,
): Promise<Response<MergeOutcome>> {
  const r = await createWrite(api, token, fetchFn)("POST", `/review/${caseId}/merge`, {
    targetSpeciesId,
  });
  return r.ok ? { ok: true, value: r.value as MergeOutcome } : r;
}
