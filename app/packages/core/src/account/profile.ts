import {
  appError,
  defineOperation,
  failed,
  ok,
  orNull,
  shape,
  textField,
  timeZoneField,
  type ErrorDetail,
} from "../kernel";

/** The occasions a reminder can be switched for (US-MON-08). */
export const NOTIFICATION_OCCASIONS = [
  "phase",
  "treatment",
  "measurement",
  "watering",
  "swap",
  "friends",
] as const;

export type NotificationOccasion = (typeof NOTIFICATION_OCCASIONS)[number];

/** On or off per occasion. A switch that was never touched is on (starting value, assumption). */
export type NotificationSwitches = Readonly<Record<NotificationOccasion, boolean>>;

/** Limit of the display name in characters (assumption, starting value). */
export const DISPLAY_NAME_LIMITS = { min: 1, max: 80 } as const;

/** Profile and settings of one account (US-ACC-02); the display name is not unique (FR-SOZ-08). */
export interface AccountProfile {
  readonly displayName: string | null;
  /** IANA name, e.g. `Europe/Berlin`; `null` = not chosen yet, the device decides (NFR-08). */
  readonly timeZone: string | null;
  /** Suspends all sharing settings without deleting them (US-SOZ-04). */
  readonly everythingPrivate: boolean;
  /** No affiliate or equipment recommendations (US-EQU-11). */
  readonly noRecommendations: boolean;
  readonly notifications: NotificationSwitches;
}

/** A save of the profile: like the profile, but `displayName: null` keeps the stored name (US-ACC-02). */
export type ProfileChanges = AccountProfile;

/** Port for persistence; the adapter lives in `db` (AB-1) and runs as the account of the caller (P-04). */
export interface ProfileStore {
  /** `null` while the account has no data row yet. */
  find(userId: string): Promise<AccountProfile | null>;
  /** Writes the changes in one statement; `displayName: null` leaves the stored name as it is. */
  update(userId: string, changes: ProfileChanges): Promise<AccountProfile | null>;
}

export const defaultNotifications = (): NotificationSwitches =>
  Object.fromEntries(NOTIFICATION_OCCASIONS.map((o) => [o, true])) as NotificationSwitches;

const flag = (field: string) => (value: unknown) =>
  typeof value === "boolean" ? value : ({ field, code: "input.invalid" } as ErrorDetail);

/** Known occasions only, each a boolean; missing ones stay on. Anything else is refused, never dropped silently (P-10). */
function notificationsField(field: string) {
  return (value: unknown): NotificationSwitches | ErrorDetail => {
    const bad: ErrorDetail = { field, code: "input.invalid" };
    if (value === undefined || value === null) return defaultNotifications();
    if (typeof value !== "object" || Array.isArray(value)) return bad;
    const given = value as Record<string, unknown>;
    const known: readonly string[] = NOTIFICATION_OCCASIONS;
    if (Object.keys(given).some((k) => !known.includes(k))) return bad;
    if (Object.values(given).some((v) => typeof v !== "boolean")) return bad;
    return { ...defaultNotifications(), ...(given as Partial<NotificationSwitches>) };
  };
}

const schema = shape({
  displayName: orNull(textField("displayName", DISPLAY_NAME_LIMITS)),
  timeZone: orNull(timeZoneField("timeZone")),
  everythingPrivate: flag("everythingPrivate"),
  noRecommendations: flag("noRecommendations"),
  notifications: notificationsField("notifications"),
});

export interface ProfileDependencies {
  readonly profiles: ProfileStore;
}

/**
 * Saves the profile as a whole (US-ACC-02, P-03): display name (free, not unique; `null` or left out keeps the stored
 * name, so a name can be changed but never removed), time zone (IANA name, validated
 * against the time zone database), the two global switches and the switch per notification occasion. Only the own
 * account can be written; the account is the one of the caller, never part of the input (P-04). Writing the same
 * values twice changes nothing. An account without a data row yet answers `access.denied`.
 */
export const accountUpdateProfile = (deps: ProfileDependencies) =>
  defineOperation({
    name: "account.update_profile",
    schema,
    run: async ({ userId }, input) => {
      const saved = await deps.profiles.update(userId, input);
      return saved ? ok(saved) : failed(appError("access.denied"));
    },
  });
