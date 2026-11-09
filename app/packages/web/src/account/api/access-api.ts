import type {
  CreatedInvitation,
  IntroductionFigures,
  OperatorCostFigure,
  OperatorOverview,
} from "@pflanzendex/core";
import {
  call,
  currentTimeZone,
  type Response,
  type WriteOptions,
  writeFor,
} from "../../shared/data";

type FetchFn = typeof fetch;

/** Counts and invitation states for the operator (US-ACC-05); a plant keeper gets `access.denied`. */
export const loadOverview = (
  api: string,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<OperatorOverview>> =>
  call<OperatorOverview>(fetchFn, `${api}/operator/overview`, token);

/** The figures of the introduction against the targets for the operator (US-ONB-08); counts, never an account. */
export const loadIntroduction = (
  api: string,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<IntroductionFigures>> =>
  call<IntroductionFigures>(fetchFn, `${api}/operator/introduction`, token);

/** One open deletion as the API sends it (US-ACC-04): UTC instants as ISO strings; no account. */
export interface DeletionEntry {
  readonly kind: "request" | "identity";
  /** The deletion log entry of an identity removal; `null` for a request. */
  readonly entryId: string | null;
  readonly requestedAt: string;
  readonly deadline: string;
  /** The sign-in subject of an identity removal; `null` for a request. */
  readonly subject: string | null;
  readonly completedAt: string | null;
}

/** The card "Fristen" (US-ACC-04, issue 1673): near and passed deadlines, and the open identity removals. */
export interface DeletionsView {
  readonly warningDays: number;
  readonly near: readonly DeletionEntry[];
  readonly past: readonly DeletionEntry[];
  readonly identityRemovals: readonly DeletionEntry[];
}

/** The open deletions for the operator; a plant keeper gets `access.denied`. */
export const loadDeletions = (
  api: string,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<DeletionsView>> =>
  call<DeletionsView>(fetchFn, `${api}/operator/deletions`, token);

/** Marks an identity removal done by hand (US-ACC-04); repeating it answers success with `already`. */
export async function markIdentityRemoved(
  api: string,
  token: string,
  entryId: string,
  options: WriteOptions = {},
): Promise<Response<{ entryId: string; outcome: "marked" | "already" }>> {
  const r = await writeFor(api, token, options)(
    "POST",
    `/operator/deletion-log/${entryId}/identity-removed`,
    {},
  );
  return r.ok
    ? { ok: true, value: r.value as { entryId: string; outcome: "marked" | "already" } }
    : r;
}

/** Registration with or without invitation code; the repeat-guard key is the action's (`options.key`), else made per call. */
export async function setRegistrationMode(
  api: string,
  token: string,
  invitationOnly: boolean,
  options: WriteOptions = {},
): Promise<Response<{ invitationOnly: boolean }>> {
  const r = await writeFor(api, token, options)("PUT", "/operator/registration", {
    invitationOnly,
  });
  return r.ok ? { ok: true, value: r.value as { invitationOnly: boolean } } : r;
}

/** The real hosting cost of one month (US-ACC-05, NFR-16); replaces the figure entered before. */
export async function setOperatorCost(
  api: string,
  token: string,
  figure: OperatorCostFigure,
  options: WriteOptions = {},
): Promise<Response<OperatorCostFigure>> {
  const r = await writeFor(api, token, options)("PUT", "/operator/cost", figure);
  return r.ok ? { ok: true, value: r.value as OperatorCostFigure } : r;
}

/** The answer carries the code exactly once. */
export async function createInvitation(
  api: string,
  token: string,
  validForDays: number,
  options: WriteOptions = {},
): Promise<Response<CreatedInvitation>> {
  const r = await writeFor(api, token, options)("POST", "/operator/invitations", {
    validForDays,
  });
  return r.ok ? { ok: true, value: r.value as CreatedInvitation } : r;
}

/** Registers the signed-in identity with an invitation code; there is no account yet, so no repeat-guard key. */
export const redeemInvitation = (
  api: string,
  token: string,
  code: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<{ registered: boolean }>> =>
  call<{ registered: boolean }>(fetchFn, `${api}/registration/invitation`, token, {
    method: "POST",
    body: { code },
  });

/** A UTC instant of the API as date and time in the time zone of the profile (NFR-08). */
export const instantText = (iso: string): string =>
  new Intl.DateTimeFormat("de-DE", {
    timeZone: currentTimeZone(),
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
