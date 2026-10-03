import type { Specimen } from "@pflanzendex/core";
import { createWrite, type Response } from "../kernel";

type FetchFn = typeof fetch;

/**
 * Creates a specimen. The device's time zone determines "today" for caught_at (NFR-08); the profile has none yet
 * (US-ACC-02). The repeat-guard key is created per call.
 */
export async function createSpecimen(
  api: string,
  token: string,
  input: { speciesId: string; marker?: string; locationId?: string; status?: "cutting" },
  fetchFn: FetchFn = fetch,
): Promise<Response<Specimen>> {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
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
