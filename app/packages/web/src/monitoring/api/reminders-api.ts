import type { FertilizingView, ReminderRow, ReminderSettings } from "@pflanzendex/core";
import {
  call,
  createWrite,
  currentTimeZone,
  type Response,
  type WriteOptions,
} from "../../shared/data";

type FetchFn = typeof fetch;

/** The in-app inbox, newest first (US-MON-01); days with nothing due are not listed. */
export const loadInbox = async (
  api: string,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<readonly ReminderRow[]>> => {
  const r = await call<{ reminders: readonly ReminderRow[] }>(fetchFn, `${api}/reminders`, token);
  return r.ok ? { ok: true, value: r.value.reminders } : r;
};

/** The reminder settings of the own account, the defaults until saved (US-MON-08). */
export const loadReminderSettings = (
  api: string,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<ReminderSettings>> => call(fetchFn, `${api}/reminders/settings`, token);

/** Saves the settings as a whole; the repeat-guard key is the caller's (`options.key`, US-QS-03). */
export async function saveReminderSettings(
  api: string,
  token: string,
  settings: ReminderSettings,
  options: WriteOptions,
): Promise<Response<ReminderSettings>> {
  const r = await createWrite(api, token, options)("PUT", "/reminders/settings", settings);
  return r.ok ? { ok: true, value: r.value as ReminderSettings } : r;
}

/** The push subscriptions of the account's browsers: endpoints only, never the keys. */
export const loadSubscriptions = async (
  api: string,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<readonly string[]>> => {
  const r = await call<{ subscriptions: readonly { endpoint: string }[] }>(
    fetchFn,
    `${api}/reminders/subscriptions`,
    token,
  );
  return r.ok ? { ok: true, value: r.value.subscriptions.map((s) => s.endpoint) } : r;
};

export const removeSubscription = (
  api: string,
  token: string,
  endpoint: string,
  options: WriteOptions,
) => createWrite(api, token, options)("DELETE", "/reminders/subscriptions", { endpoint });

/** A plant that is due to be watered today (US-MON-05). */
export interface WateringDueRow {
  readonly specimenId: string;
  readonly name: string;
  readonly intervalDays: number;
  readonly lastWateredOn: string | null;
  readonly daysSince: number;
}

/** The plants due to be watered today, derived on every request in the zone of the profile (US-MON-05, NFR-08). */
export async function loadWateringDue(
  api: string,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<readonly WateringDueRow[]>> {
  const zone = encodeURIComponent(currentTimeZone());
  const r = await call<{ due: readonly WateringDueRow[] }>(
    fetchFn,
    `${api}/watering/due?timeZone=${zone}`,
    token,
  );
  return r.ok ? { ok: true, value: r.value.due } : r;
}

/** "Gegossen" for one or several specimens; the server takes today's date in the zone of the profile. */
export const markWatered = (
  api: string,
  token: string,
  specimenIds: readonly string[],
  options: WriteOptions,
) =>
  createWrite(api, token, options)("POST", "/watering", {
    specimenIds,
    timeZone: currentTimeZone(),
  });

/** The date of the latest fertilizing of one plant, `null` when none is logged (US-MON-09, P-08). */
export const loadLastFertilized = (
  api: string,
  token: string,
  specimenId: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<FertilizingView>> =>
  call(fetchFn, `${api}/specimens/${encodeURIComponent(specimenId)}/fertilizing`, token);

/** "Gedüngt" for one plant (US-MON-09); the server takes today's date in the zone of the profile. */
export const markFertilized = (
  api: string,
  token: string,
  specimenId: string,
  options: WriteOptions,
) =>
  createWrite(api, token, options)("POST", "/fertilizing", {
    specimenId,
    timeZone: currentTimeZone(),
  });

/**
 * Whether a write of `count` plants made all of their entries today: only then the undo may take them back, because an
 * entry that was there before the write must stay (US-QS-32). Shared by the plant layer and the sheet.
 */
export const madeEntries = (value: unknown, count: number): boolean =>
  (value as { created?: unknown } | null)?.created === count;

/**
 * The undo of "Gegossen" (US-QS-32): takes the entries of the given plants of `date` back through `monitoring.unwater`. `date`
 * is the day the write used (its response), so an undo after midnight still means that day (NFR-08). The answer says how many
 * entries were removed (`removed`, 0 when they are gone already). The repeat-guard key is the caller's (`options.key`, US-QS-03).
 */
export const unwaterPlants = (
  api: string,
  token: string,
  input: { specimenIds: readonly string[]; date: string },
  options: WriteOptions,
) =>
  createWrite(api, token, options)("POST", "/watering/unwater", {
    ...input,
    timeZone: currentTimeZone(),
  });
