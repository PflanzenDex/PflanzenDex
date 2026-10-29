import { useCallback } from "react";
import { loadProfile } from "@/account";
import { loadAchievements } from "@/achievements";
import { loadConnections } from "@/ai";
import { useFeature, useRequest } from "@/kernel";
import type { AccountSection } from "@/components/shared/navigation/nav-model/navigation/navigation";

type Token = () => Promise<string | undefined>;

/** `undefined` while it loads, `null` when it has no value in the index (the row shows only its name). */
export type Values = Partial<Record<AccountSection, string | null | undefined>> & {
  achievementsShown: boolean;
};

const UNKNOWN = "unbekannt";

/**
 * The current value of the rows of the index (US-QS-17): display name and time zone, reminders on or off (any
 * occasion switched on), the count of achievements and of connected AI clients. A value that cannot be read says
 * "unbekannt" (P-08, P-10); calm mode hides the row of the achievements (US-ACH-08). The requests share their keys with the sections.
 */
export function useAccountValues(api: string, token: Token): Values {
  const ai = useFeature("ai");
  const profile = useRequest({
    queryKey: ["account", "profile"],
    fresh: true,
    token,
    load: useCallback((t: string) => loadProfile(api, t), [api]),
  });
  const achievements = useRequest({
    queryKey: ["achievements", "index"],
    token,
    load: useCallback((t: string) => loadAchievements(api, t), [api]),
  });
  const clients = useRequest({
    queryKey: ["ai", "connections", "index"],
    token,
    enabled: ai,
    load: useCallback((t: string) => loadConnections(api, t), [api]),
  });
  const loaded = <T>(r: { status: string; value: T | undefined }, text: (v: T) => string) =>
    r.status === "pending" ? undefined : r.value === undefined ? UNKNOWN : text(r.value);
  return {
    achievementsShown: achievements.status === "error" || achievements.value?.calmMode === false,
    settings: loaded(profile, (p) => `${p.displayName || UNKNOWN} · ${p.timeZone || UNKNOWN}`),
    reminders: loaded(profile, (p) =>
      Object.values(p.notifications).some(Boolean) ? "an" : "aus",
    ),
    achievements: loaded(achievements, (a) => (a.calmMode ? UNKNOWN : String(a.earnedCount))),
    aiClients: loaded(clients, (c) => String(c.filter((x) => x.revokedAt === null).length)),
  };
}
