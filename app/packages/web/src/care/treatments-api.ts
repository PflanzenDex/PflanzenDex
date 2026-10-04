import type { TreatmentListRow, TreatmentRow } from "@pflanzendex/core";
import { call, createWrite, type Response } from "../kernel";

type FetchFn = typeof fetch;

/** What the form needs of a specimen: archived ones are not listed by the API (FR-BEH-04). */
export interface TreatableSpecimen {
  id: string;
  name: string;
}

/** The active specimens of the account, also cuttings (FR-BEH-04). */
export async function loadTreatableSpecimens(
  api: string,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<readonly TreatableSpecimen[]>> {
  const r = await call<{ specimens: TreatableSpecimen[] }>(fetchFn, `${api}/specimens`, token);
  return r.ok ? { ok: true, value: r.value.specimens.map(({ id, name }) => ({ id, name })) } : r;
}

export interface TreatmentInput {
  specimenIds: readonly string[];
  reason: string;
  agent?: string;
  /** Local calendar date `YYYY-MM-DD` of the first (or only) date. */
  date: string;
  /** Only for "Kur planen": N dates at T days (US-BEH-01). */
  course?: { count: number; intervalDays: number };
}

/**
 * Plans treatments (US-BEH-01). The repeat-guard key is created per call, so a double tap or a retry writes once.
 */
export async function planTreatments(
  api: string,
  token: string,
  input: TreatmentInput,
  fetchFn: FetchFn = fetch,
): Promise<Response<readonly TreatmentRow[]>> {
  const { course, ...rest } = input;
  const r = await createWrite(api, token, fetchFn)("POST", "/treatments", {
    ...rest,
    ...(course ? { count: course.count, intervalDays: course.intervalDays } : {}),
  });
  return r.ok ? { ok: true, value: (r.value as { treatments: TreatmentRow[] }).treatments } : r;
}

/**
 * Ticks a treatment off (US-BEH-03). The treatment is addressed by its ID, the done date is the device's local date
 * (NFR-08). The repeat-guard key is created per call; a second tap on another device changes nothing.
 */
export async function completeTreatment(
  api: string,
  token: string,
  id: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<TreatmentRow>> {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const r = await createWrite(api, token, fetchFn)(
    "POST",
    `/treatments/${encodeURIComponent(id)}/complete`,
    {
      timeZone,
    },
  );
  return r.ok ? { ok: true, value: (r.value as { treatment: TreatmentRow }).treatment } : r;
}

/** The done treatments of one specimen, latest first (history, US-BEH-03). */
export async function loadTreatmentHistory(
  api: string,
  token: string,
  specimenId: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<readonly TreatmentRow[]>> {
  const r = await call<{ treatments: TreatmentRow[] }>(
    fetchFn,
    `${api}/treatments/history?specimenId=${encodeURIComponent(specimenId)}`,
    token,
  );
  return r.ok ? { ok: true, value: r.value.treatments } : r;
}

/** The open treatments of the account, earliest first, with status for the device's local "today" (US-BEH-02, NFR-08). */
export async function loadOpenTreatments(
  api: string,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<readonly TreatmentListRow[]>> {
  const timeZone = encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const r = await call<{ treatments: TreatmentListRow[] }>(
    fetchFn,
    `${api}/treatments?timeZone=${timeZone}`,
    token,
  );
  return r.ok ? { ok: true, value: r.value.treatments } : r;
}
