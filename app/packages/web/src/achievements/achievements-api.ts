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
