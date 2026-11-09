import type { MeasurementView, MeasurementRow, Quality } from "@pflanzendex/core";
import {
  call,
  createWrite,
  currentTimeZone,
  type Response,
  type WriteOptions,
} from "../../../shared/data";

type FetchFn = typeof fetch;

export interface MeasurementInput {
  value: number;
  /** `YYYY-MM-DD`; without a statement today in the device's time zone applies. */
  date?: string;
  quality: Quality;
  note?: string;
}

/** Loads the "Measure" view of a specimen. */
export function loadMeasurementView(
  api: string,
  token: string,
  specimenId: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<MeasurementView>> {
  return call<MeasurementView>(
    fetchFn,
    `${api}/specimens/${encodeURIComponent(specimenId)}/measurements`,
    token,
  );
}

/** Where to and as whom: address of the API, token and (for tests) the fetch function. */
export interface Access {
  api: string;
  token: string;
  fetchFn?: FetchFn;
}

/**
 * Records a measurement. The profile's time zone (US-ACC-02; the device's as fallback) determines "today" (NFR-08). `key` is
 * the repeat-guard key of the action (US-QS-03, see `newRepeatKey`): the caller repeats a lost save with the same key.
 */
export async function recordMeasurement(
  access: Access,
  specimenId: string,
  input: MeasurementInput,
  options: WriteOptions = {},
): Promise<Response<MeasurementRow>> {
  const timeZone = currentTimeZone();
  const r = await createWrite(
    access.api,
    access.token,
    access.fetchFn ?? fetch,
    options.key,
  )("POST", `/specimens/${encodeURIComponent(specimenId)}/measurements`, { ...input, timeZone });
  return r.ok ? { ok: true, value: r.value as MeasurementRow } : r;
}
