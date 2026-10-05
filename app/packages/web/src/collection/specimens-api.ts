import type { Specimen } from "@pflanzendex/core";
import { createWrite, currentTimeZone, type Response } from "../kernel";

type FetchFn = typeof fetch;

/**
 * Creates a specimen. The profile's time zone (US-ACC-02; the device's as fallback) determines "today" for caught_at (NFR-08). The repeat-guard key is created per call.
 */
export async function createSpecimen(
  api: string,
  token: string,
  input: {
    speciesId: string;
    marker?: string;
    /** Markers for existing specimens that have none yet, from the 3rd specimen on (US-BES-03). */
    markers?: { specimenId: string; marker: string }[];
    locationId?: string;
    status?: "cutting";
    /** Back-dated catch date `YYYY-MM-DD` (FR-BES-04); without it the server uses today's local date. */
    catchDate?: string;
  },
  fetchFn: FetchFn = fetch,
): Promise<Response<Specimen>> {
  const timeZone = currentTimeZone();
  const r = await createWrite(api, token, fetchFn)("POST", "/specimens", {
    ...input,
    timeZone,
  });
  return r.ok ? { ok: true, value: r.value as Specimen } : r;
}

/** Repots a cutting (US-BES-04): the cutting becomes a plant. The key is created per call. */
export async function repotSpecimen(
  api: string,
  token: string,
  id: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<Specimen>> {
  const r = await createWrite(api, token, fetchFn)(
    "POST",
    `/specimens/${encodeURIComponent(id)}/repot`,
    {},
  );
  return r.ok ? { ok: true, value: r.value as Specimen } : r;
}

/**
 * Sets the location of a specimen from the own locations (US-PHA-03, BES-08 "Standort fehlt"). The location is chosen
 * from a list, never typed. The repeat-guard key is created per call.
 */
export async function setSpecimenLocation(
  api: string,
  token: string,
  input: { id: string; locationId: string },
  fetchFn: FetchFn = fetch,
): Promise<Response<Specimen>> {
  const r = await createWrite(api, token, fetchFn)(
    "POST",
    `/specimens/${encodeURIComponent(input.id)}/location`,
    { locationId: input.locationId },
  );
  return r.ok ? { ok: true, value: r.value as Specimen } : r;
}

/** Gives a specimen a marker or changes it (US-BES-03). The repeat-guard key is created per call. */
export async function markSpecimen(
  api: string,
  token: string,
  input: { id: string; marker: string },
  fetchFn: FetchFn = fetch,
): Promise<Response<Specimen>> {
  const r = await createWrite(api, token, fetchFn)(
    "POST",
    `/specimens/${encodeURIComponent(input.id)}/marker`,
    { marker: input.marker },
  );
  return r.ok ? { ok: true, value: r.value as Specimen } : r;
}

/**
 * Corrects the catch date of a specimen (US-BES-11). The profile's time zone (US-ACC-02; the device's as fallback)
 * decides what "in the future" means (NFR-08). The repeat-guard key is created per call.
 */
export async function correctCatchDate(
  api: string,
  token: string,
  input: { id: string; catchDate: string },
  fetchFn: FetchFn = fetch,
): Promise<Response<Specimen>> {
  const r = await createWrite(api, token, fetchFn)(
    "POST",
    `/specimens/${encodeURIComponent(input.id)}/catch-date`,
    { catchDate: input.catchDate, timeZone: currentTimeZone() },
  );
  return r.ok ? { ok: true, value: r.value as Specimen } : r;
}
