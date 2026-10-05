import type { CreatedInvitation, OperatorCostFigure, OperatorOverview } from "@pflanzendex/core";
import { call, createWrite, currentTimeZone, type Response } from "../kernel";

type FetchFn = typeof fetch;

/** Counts and invitation states for the operator (US-ACC-05); a plant keeper gets `access.denied`. */
export const loadOverview = (
  api: string,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<OperatorOverview>> =>
  call<OperatorOverview>(fetchFn, `${api}/operator/overview`, token);

/** Registration with or without invitation code; the repeat-guard key is created per call. */
export async function setRegistrationMode(
  api: string,
  token: string,
  invitationOnly: boolean,
  fetchFn: FetchFn = fetch,
): Promise<Response<{ invitationOnly: boolean }>> {
  const r = await createWrite(api, token, fetchFn)("PUT", "/operator/registration", {
    invitationOnly,
  });
  return r.ok ? { ok: true, value: r.value as { invitationOnly: boolean } } : r;
}

/** The real hosting cost of one month (US-ACC-05, NFR-16); replaces the figure entered before. */
export async function setOperatorCost(
  api: string,
  token: string,
  figure: OperatorCostFigure,
  fetchFn: FetchFn = fetch,
): Promise<Response<OperatorCostFigure>> {
  const r = await createWrite(api, token, fetchFn)("PUT", "/operator/cost", figure);
  return r.ok ? { ok: true, value: r.value as OperatorCostFigure } : r;
}

/** The answer carries the code exactly once. */
export async function createInvitation(
  api: string,
  token: string,
  validForDays: number,
  fetchFn: FetchFn = fetch,
): Promise<Response<CreatedInvitation>> {
  const r = await createWrite(api, token, fetchFn)("POST", "/operator/invitations", {
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
