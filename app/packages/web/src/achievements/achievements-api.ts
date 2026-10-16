import { call, createWrite, currentTimeZone, type Response } from "../kernel";

/** The settings of the achievements of the account (DM-ACH-03); the same shape the API returns. */
export type AchievementSettings = { calmMode: boolean };

export function loadAchievementSettings(
  api: string,
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<Response<AchievementSettings>> {
  return call<AchievementSettings>(fetchFn, `${api}/achievements/settings`, token);
}

/** Switches calm mode (US-ACH-08); answers the stored setting. */
export async function setCalmMode(
  api: string,
  token: string,
  calmMode: boolean,
  fetchFn: typeof fetch = fetch,
): Promise<Response<AchievementSettings>> {
  const r = await createWrite(api, token, fetchFn)("PUT", "/achievements/settings/calm-mode", {
    calmMode,
  });
  return r.ok ? { ok: true, value: r.value as AchievementSettings } : r;
}

export type AchievementGroup = "care" | "growth" | "swapping" | "collecting";
export type AchievementStep = {
  key: string;
  specimenId: string | null;
  specimenName: string | null;
};
export type AchievementItem = {
  id: string;
  /** Earned and not yet acknowledged with "Okay" (US-ACH-03). */
  isNew: boolean;
  earnedOn: string | null;
  specimenId: string | null;
  specimenName: string | null;
  nextStep: AchievementStep | null;
  missing: string | null;
};
export type AchievementsOverview =
  | { calmMode: true }
  | {
      calmMode: false;
      earnedCount: number;
      newCount: number;
      firstStep: AchievementStep | null;
      groups: { group: AchievementGroup; earned: AchievementItem[]; open: AchievementItem[] }[];
    };

/** The overview derived from the own data (US-ACH-02); `{ calmMode: true }` hides it (US-ACH-08). */
export function loadAchievements(
  api: string,
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<Response<AchievementsOverview>> {
  return call<AchievementsOverview>(
    fetchFn,
    `${api}/achievements?timeZone=${encodeURIComponent(currentTimeZone())}`,
    token,
  );
}

/** What is new (earned minus seen) and what to create silently as seen (US-ACH-03); `{ calmMode: true }` hides it. */
export type AchievementNews =
  | { calmMode: true }
  | {
      calmMode: false;
      fresh: { id: string; earnedOn: string | null; specimenName: string | null }[];
      acknowledge: string[];
      needsWrite: boolean;
    };

export function loadNews(
  api: string,
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<Response<AchievementNews>> {
  return call<AchievementNews>(
    fetchFn,
    `${api}/achievements/news?timeZone=${encodeURIComponent(currentTimeZone())}`,
    token,
  );
}

/** Marks achievements as seen (US-ACH-03): "Okay" in the overview, and the silent creation of the state. */
export async function markSeen(
  api: string,
  token: string,
  achievements: readonly string[],
  fetchFn: typeof fetch = fetch,
): Promise<Response<{ seen: string[] }>> {
  const r = await createWrite(api, token, fetchFn)("POST", "/achievements/seen", {
    achievements,
    timeZone: currentTimeZone(),
  });
  return r.ok ? { ok: true, value: r.value as { seen: string[] } } : r;
}
