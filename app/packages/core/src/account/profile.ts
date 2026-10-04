import { appError, type Result } from "../kernel/index.ts";
import { isTimeZone } from "../kernel/date.ts";

/** User profile and settings (US-ACC-02). */
export type AccountProfile = {
  displayName: string | null;
  timeZone: string | null;
  everythingPrivate: boolean;
  noRecommendations: boolean;
  notificationSettings: NotificationSettings | null;
};

/** Notification preferences for an occasion. */
export type NotificationPreference = {
  enabled: boolean;
  time?: string | null; // HH:MM format if enabled
  quietHours?: { start: string; end: string } | null;
};

/** Notification settings by occasion (US-MON-08). */
export type NotificationSettings = {
  phase?: NotificationPreference;
  treatment?: NotificationPreference;
  measurement?: NotificationPreference;
  watering?: NotificationPreference;
  swap?: NotificationPreference;
  friends?: NotificationPreference;
};

/** Input for updating account profile. */
export type UpdateProfileInput = {
  displayName?: string | null;
  timeZone?: string | null;
  everythingPrivate?: boolean;
  noRecommendations?: boolean;
  notificationSettings?: NotificationSettings | null;
};

function validateDisplayName(name: string | undefined | null): string | null {
  if (name === undefined || name === null) return null;
  if (typeof name !== "string" || name.trim().length === 0 || name.length > 255) {
    throw new Error("invalid_display_name");
  }
  return name;
}

function validateTimeZoneValue(tz: string | undefined | null): string | null {
  if (tz === undefined || tz === null) return null;
  if (!isTimeZone(tz)) throw new Error("invalid_time_zone");
  return tz;
}

function validateNotificationTime(time: string | undefined | null): string | null {
  if (time === undefined || time === null) return null;
  if (!/^\d{2}:\d{2}$/.test(time)) throw new Error("invalid_time_format");
  return time;
}

/** Validates profile input. */
export function validateProfileInput(input: UpdateProfileInput): Result<UpdateProfileInput> {
  try {
    if (input.displayName !== undefined) {
      validateDisplayName(input.displayName);
    }
    if (input.timeZone !== undefined) {
      validateTimeZoneValue(input.timeZone);
    }
    if (input.notificationSettings) {
      Object.values(input.notificationSettings).forEach((pref) => {
        if (pref?.time) validateNotificationTime(pref.time);
      });
    }
    return { kind: "fresh", value: input };
  } catch {
    return { kind: "error", error: appError("input.invalid") };
  }
}
