import { useCallback } from "react";
import { loadProfile, nameValue, timeZoneValue } from "@/account";
import { loadAchievements } from "@/achievements";
import { loadConnections } from "@/ai";
import { useFeature, useRequest } from "@/shared/data";
import { NOT_LOADED } from "@/shared/patterns/states/request-state/failed-value/failed-value";
import type { AccountSection } from "@/shared/patterns/navigation/navigation/navigation";
import { SECTIONS } from "../account-model/account-model";

type Token = () => Promise<string | undefined>;

/** `undefined` while it loads, `null` when it has no value in the index (the row shows only its name). */
export type Values = Partial<Record<AccountSection, string | null | undefined>> & {
  achievementsShown: boolean;
  /** The retry of a section whose request failed: its row shows "Nicht geladen" and offers "Erneut versuchen" (US-QS-32). */
  retries: Partial<Record<AccountSection, () => void>>;
};

const UNKNOWN = "unbekannt";

/** The rows of the index: every section that is on for the account; the profile has its own row above them. */
export function rowsOf(values: Values, ai: boolean | undefined, hasOverview: boolean) {
  return SECTIONS.filter(
    (s) =>
      s.key !== "profile" &&
      (s.key !== "achievements" || values.achievementsShown) &&
      (s.key !== "aiClients" || ai) &&
      (s.key !== "functions" || hasOverview),
  );
}

/**
 * The current value of the rows of the index (US-QS-17): display name and time zone, reminders in the inbox (any
 * occasion switched on) or off, the count of achievements and of connected AI clients. The reminders say "im
 * Posteingang" and never "an" while push is not set up (US-QS-32, issue 2028). A section whose request failed says
 * "Nicht geladen" and offers its retry (US-QS-32, P-10); "unbekannt" stays for a value that is truly unknown (P-08).
 * Calm mode hides the row of the achievements (US-ACH-08), and so does the keeper's switch of the achievements
 * (US-ONB-09), which then asks nothing. The requests share their keys with the sections.
 */
export function useAccountValues(api: string, token: Token): Values {
  const ai = useFeature("ai");
  const achievementsOn = useFeature("achievement_views");
  const profile = useRequest({
    queryKey: ["account", "profile"],
    fresh: true,
    token,
    load: useCallback((t: string) => loadProfile(api, t), [api]),
  });
  const achievements = useRequest({
    queryKey: ["achievements", "index"],
    token,
    enabled: achievementsOn,
    load: useCallback((t: string) => loadAchievements(api, t), [api]),
  });
  const clients = useRequest({
    queryKey: ["ai", "connections", "index"],
    token,
    enabled: ai,
    load: useCallback((t: string) => loadConnections(api, t), [api]),
  });
  const loaded = <T>(r: { status: string; value: T | undefined }, text: (v: T) => string) =>
    r.status === "pending"
      ? undefined
      : r.status === "error"
        ? NOT_LOADED
        : r.value === undefined
          ? UNKNOWN
          : text(r.value);
  const retries: Values["retries"] = {};
  if (profile.status === "error") {
    retries.settings = profile.retry;
    retries.reminders = profile.retry;
  }
  if (achievements.status === "error") retries.achievements = achievements.retry;
  if (clients.status === "error") retries.aiClients = clients.retry;
  return {
    achievementsShown:
      achievementsOn && (achievements.status === "error" || achievements.value?.calmMode === false),
    settings: loaded(profile, (p) => `${nameValue(p.displayName)} · ${timeZoneValue(p.timeZone)}`),
    reminders: loaded(profile, (p) =>
      Object.values(p.notifications).some(Boolean) ? "im Posteingang" : "aus",
    ),
    achievements: loaded(achievements, (a) => (a.calmMode ? UNKNOWN : String(a.earnedCount))),
    aiClients: loaded(clients, (c) => String(c.filter((x) => x.revokedAt === null).length)),
    retries,
  };
}
