// Reminder settings and delivery channels (US-MON-08, DM-MON-01): validating operations (P-03) for the own account only
// (P-04). Quiet hours, the time of the daily check, pauses per occasion and the number of days of an overdue
// measurement; the push subscriptions of the browsers. Switching an occasion off for good lives in the profile (US-ACC-02).
import {
  appError,
  calendarDateField,
  defineOperation,
  failed,
  integerField,
  ok,
  orNull,
  shape,
  textField,
  type ErrorDetail,
} from "../../kernel";
import {
  REMINDER_LIMITS,
  REMINDER_OCCASIONS,
  type ChannelStore,
  type PushSubscription,
  type ReminderRow,
  type ReminderSettings,
  type ReminderStore,
} from "../types";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const bad = (field: string): ErrorDetail => ({ field, code: "input.invalid" });

const timeField = (field: string) => (value: unknown) =>
  typeof value === "string" && TIME.test(value) ? value : bad(field);

/** Known occasions only, each a calendar date; anything else is refused, never dropped silently (P-10). */
function pausedField(field: string) {
  const date = calendarDateField(field);
  return (value: unknown): ReminderSettings["paused"] | ErrorDetail => {
    if (value === undefined || value === null) return {};
    if (typeof value !== "object" || Array.isArray(value)) return bad(field);
    const known: readonly string[] = REMINDER_OCCASIONS;
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.some(([k]) => !known.includes(k))) return bad(field);
    const dates = entries.map(([, v]) => date(v));
    return dates.some((d) => typeof d !== "string")
      ? bad(field)
      : Object.fromEntries(entries.map(([k], i) => [k, dates[i]]));
  };
}

const schema = shape({
  sendTime: timeField("sendTime"),
  quietFrom: orNull(timeField("quietFrom")),
  quietTo: orNull(timeField("quietTo")),
  paused: pausedField("paused"),
  measurementDays: integerField("measurementDays", REMINDER_LIMITS.measurementDays),
});

export interface SettingsDependencies {
  readonly reminders: ReminderStore;
}

/**
 * Saves the reminder settings as a whole (US-MON-08): the time of the daily check (`HH:MM`, default 08:00), quiet hours
 * (both or none; nothing goes out inside them, the message waits for their end), a pause per occasion until a local date
 * and the days after which a measurement is overdue (1 to 365, default 30). Writing the same values twice changes
 * nothing. The calculation of what is due is never touched, so "Today" still shows everything (FR-MON-03).
 */
export const monitoringSaveSettings = (deps: SettingsDependencies) =>
  defineOperation({
    name: "monitoring.save_settings",
    schema,
    run: async ({ userId }, input) => {
      if ((input.quietFrom === null) !== (input.quietTo === null))
        return failed(
          appError("input.invalid", {
            details: [
              { field: input.quietFrom === null ? "quietFrom" : "quietTo", code: "input.invalid" },
            ],
          }),
        );
      return ok(await deps.reminders.saveSettings(userId, input));
    },
  });

const subscription = shape({
  endpoint: textField("endpoint", { min: 12, max: REMINDER_LIMITS.endpointMax }),
  p256dh: textField("p256dh", { min: 1, max: REMINDER_LIMITS.keyMax }),
  auth: textField("auth", { min: 1, max: REMINDER_LIMITS.keyMax }),
});

const endpointOnly = shape({
  endpoint: textField("endpoint", { min: 12, max: REMINDER_LIMITS.endpointMax }),
});

export interface ChannelDependencies {
  readonly channels: ChannelStore;
}

/** A push endpoint is an https address (RFC 8030); anything else is refused. */
const isHttps = (endpoint: string) =>
  endpoint.startsWith("https://") && endpoint.length > 12 && !/\s/.test(endpoint);

/**
 * Registers the push subscription of a browser for the own account (DM-MON-01 `delivery_channel`). The same endpoint
 * twice is one subscription; an account holds at most 10 (starting value, assumption).
 */
export const monitoringSubscribe = (deps: ChannelDependencies) =>
  defineOperation({
    name: "monitoring.subscribe",
    schema: (input) => {
      const r = subscription(input);
      return r.ok && !isHttps(r.value.endpoint)
        ? failed(appError("input.invalid", { details: [bad("endpoint")] }))
        : r;
    },
    run: async ({ userId }, input) => {
      const added = await deps.channels.add(userId, input satisfies PushSubscription);
      return added === "limit"
        ? failed(appError("monitoring.subscription_limit"))
        : ok({ created: added === "added" });
    },
  });

/** Removes the push subscription of a browser; an unknown endpoint changes nothing (`removed: false`). */
export const monitoringUnsubscribe = (deps: ChannelDependencies) =>
  defineOperation({
    name: "monitoring.unsubscribe",
    schema: endpointOnly,
    run: async ({ userId }, input) =>
      ok({ removed: await deps.channels.remove(userId, input.endpoint) }),
  });

/**
 * The inbox: the newest reminders of the account, newest first (US-MON-01: the in-app reminder). Days with nothing to do
 * are not listed. A failed delivery stays visible with its status (FR-MON-08, P-10).
 */
export async function reminderInbox(
  deps: SettingsDependencies,
  userId: string,
): Promise<readonly ReminderRow[]> {
  return deps.reminders.list(userId, REMINDER_LIMITS.inboxMax);
}
