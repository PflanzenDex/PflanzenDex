import type { Specimen } from "@pflanzendex/core";
import { call, createWrite, type Response } from "../kernel";

type FetchFn = typeof fetch;

/** Loads the specimens of the signed-in account. */
export async function loadSpecimens(
  api: string,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<readonly Specimen[]>> {
  const r = await call<{ specimens: Specimen[] }>(fetchFn, `${api}/specimens`, token);
  return r.ok ? { ok: true, value: r.value.specimens } : r;
}

/**
 * Creates a specimen. The device's time zone determines "today" for caught_at (NFR-08); the profile has none yet
 * (US-ACC-02). The repeat-guard key is created per call.
 */
export async function createSpecimen(
  api: string,
  token: string,
  input: { speciesId: string; marker?: string; locationId?: string },
  fetchFn: FetchFn = fetch,
): Promise<Response<Specimen>> {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const r = await createWrite(api, token, fetchFn)("POST", "/specimens", {
    ...input,
    timeZone,
  });
  return r.ok ? { ok: true, value: r.value as Specimen } : r;
}
