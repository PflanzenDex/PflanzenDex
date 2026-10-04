import type { Specimen } from "@pflanzendex/core";
import { createWrite, currentTimeZone, type Response } from "../kernel";

type FetchFn = typeof fetch;

/**
 * Creates a specimen. The device's time zone determines "today" for caught_at (NFR-08); the profile has none yet
 * (US-ACC-02). The repeat-guard key is created per call.
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
