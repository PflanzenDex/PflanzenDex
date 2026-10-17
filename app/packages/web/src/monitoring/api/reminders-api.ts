import type { ReminderRow, ReminderSettings } from "@pflanzendex/core";
import { call, createWrite, currentTimeZone, type Response } from "../../kernel";

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

/** Saves the settings as a whole; the repeat-guard key is created per call. */
export async function saveReminderSettings(
  api: string,
  token: string,
  settings: ReminderSettings,
  fetchFn: FetchFn = fetch,
): Promise<Response<ReminderSettings>> {
  const r = await createWrite(api, token, fetchFn)("PUT", "/reminders/settings", settings);
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
  fetchFn: FetchFn = fetch,
) => createWrite(api, token, fetchFn)("DELETE", "/reminders/subscriptions", { endpoint });

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
  fetchFn: FetchFn = fetch,
) =>
  createWrite(api, token, fetchFn)("POST", "/watering", {
    specimenIds,
    timeZone: currentTimeZone(),
  });
