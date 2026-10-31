import type { TreatmentListRow, TreatmentRow } from "@pflanzendex/core";
import { call, createWrite, currentTimeZone, type Response } from "../../../kernel";

type FetchFn = typeof fetch;

/**
 * What the form needs of a specimen: its name and where it stands, for the location filter (US-BEH-01). Archived ones
 * are not listed by the API (FR-BEH-04). `location` is `null` when the place is unknown (P-08).
 */
export interface TreatableSpecimen {
  id: string;
  name: string;
  location?: string | null;
}

/** The active specimens of the account, also cuttings, with their location name (FR-BEH-04, US-BEH-01). */
export async function loadTreatableSpecimens(
  api: string,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<readonly TreatableSpecimen[]>> {
  const timeZone = encodeURIComponent(currentTimeZone());
  const r = await call<{ cards: TreatableSpecimen[] }>(
    fetchFn,
    `${api}/specimens/cards?timeZone=${timeZone}`,
    token,
  );
  return r.ok
    ? {
        ok: true,
        value: r.value.cards.map(({ id, name, location }) => ({
          id,
          name,
          location: location ?? null,
        })),
      }
    : r;
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
  const timeZone = currentTimeZone();
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
  const timeZone = encodeURIComponent(currentTimeZone());
  const r = await call<{ treatments: TreatmentListRow[] }>(
    fetchFn,
    `${api}/treatments?timeZone=${timeZone}`,
    token,
  );
  return r.ok ? { ok: true, value: r.value.treatments } : r;
}
