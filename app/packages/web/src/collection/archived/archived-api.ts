import type { ArchivedEntry, SpecimenRow } from "@pflanzendex/core";
import {
  call,
  currentTimeZone,
  type Response,
  type WriteOptions,
  writeFor,
} from "../../shared/data";

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
 * Archives a specimen with a reason. The profile's time zone (US-ACC-02; the device's as fallback) determines "today" for archived_on (NFR-08). The idempotency key is the action's (`options.key`), else made per call.
 */
export async function archiveSpecimen(
  api: string,
  token: string,
  input: { id: string; reason: string },
  options: WriteOptions = {},
): Promise<Response<SpecimenRow>> {
  const timeZone = currentTimeZone();
  const r = await writeFor(api, token, options)(
    "POST",
    `/specimens/${encodeURIComponent(input.id)}/archive`,
    {
      reason: input.reason,
      timeZone,
    },
  );
  return r.ok ? { ok: true, value: r.value as SpecimenRow } : r;
}

/** Restores an archived specimen. */
export async function restoreSpecimen(
  api: string,
  token: string,
  id: string,
  options: WriteOptions = {},
): Promise<Response<SpecimenRow>> {
  const r = await writeFor(api, token, options)(
    "POST",
    `/specimens/${encodeURIComponent(id)}/restore`,
    {},
  );
  return r.ok ? { ok: true, value: r.value as SpecimenRow } : r;
}
