import type { ArchivedEntry, SpecimenRow } from "@pflanzendex/core";
import { call, createWrite, type Response } from "../kernel";

type FetchFn = typeof fetch;

/** Loads the archived specimens of the account (US-BES-07). */
export async function loadArchived(
  api: string,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<readonly ArchivedEntry[]>> {
  const r = await call<{ archived: ArchivedEntry[] }>(fetchFn, `${api}/specimens/archived`, token);
  return r.ok ? { ok: true, value: r.value.archived } : r;
}

/**
 * Archives a specimen with a reason. The device's time zone determines "today" for archived_on (NFR-08); the profile
 * does not know one yet (US-ACC-02). The idempotency key is created per call.
 */
export async function archiveSpecimen(
  api: string,
  token: string,
  input: { id: string; reason: string },
  fetchFn: FetchFn = fetch,
): Promise<Response<SpecimenRow>> {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const r = await createWrite(api, token, fetchFn)(
    "POST",
    `/specimens/${encodeURIComponent(input.id)}/archive`,
    { reason: input.reason, timeZone },
  );
  return r.ok ? { ok: true, value: r.value as SpecimenRow } : r;
}

/** Restores an archived specimen. */
export async function restoreSpecimen(
  api: string,
  token: string,
  id: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<SpecimenRow>> {
  const r = await createWrite(api, token, fetchFn)(
    "POST",
    `/specimens/${encodeURIComponent(id)}/restore`,
    {},
  );
  return r.ok ? { ok: true, value: r.value as SpecimenRow } : r;
}
