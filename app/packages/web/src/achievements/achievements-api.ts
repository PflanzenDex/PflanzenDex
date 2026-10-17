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

/** The growth moment of a measurement (US-ACH-05); the same shape the API returns. */
export type GrowthMoment =
  | { kind: "unknown" }
  | { kind: "none" }
  | {
      kind: "moment";
      since: string;
      growth: number;
      ratePerYear: number;
      record: { ratePerYear: number } | null;
    };
export type GrowthAnswer =
  { calmMode: true } | { calmMode: false; latest: GrowthMoment; records: string[] };

/** Growth moment and personal records of a specimen from its own measurements (US-ACH-05). */
export function loadGrowth(
  api: string,
  token: string,
  specimenId: string,
  fetchFn: typeof fetch = fetch,
): Promise<Response<GrowthAnswer>> {
  return call<GrowthAnswer>(fetchFn, `${api}/achievements/growth/${specimenId}`, token);
}

/** A photo of an anniversary: the API path of the private image and the measurement date (P-05). */
export type AnniversaryPhoto = { url: string; date: string };
export type AnniversaryItem = {
  specimenId: string;
  name: string;
  /** Months with the keeper: 6, 12, 18, … */
  months: number;
  date: string;
  caughtOn: string;
  first: AnniversaryPhoto | null;
  latest: AnniversaryPhoto | null;
};
export type AnniversariesAnswer =
  { calmMode: true } | { calmMode: false; items: AnniversaryItem[] };

/** The anniversaries due today (US-ACH-06); `{ calmMode: true }` hides them (US-ACH-08). */
export function loadAnniversaries(
  api: string,
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<Response<AnniversariesAnswer>> {
  return call<AnniversariesAnswer>(
    fetchFn,
    `${api}/achievements/anniversaries?timeZone=${encodeURIComponent(currentTimeZone())}`,
    token,
  );
}

export type RhythmWeekState = "on_time" | "open" | "pending" | "none";
export type RhythmAnswer =
  | { calmMode: true }
  | {
      calmMode: false;
      weeks: { start: string; state: RhythmWeekState }[];
      currentRun: number;
      longestRun: number;
      openTasks: number;
      hasTasks: boolean;
    };

/** The care rhythm of the last 12 weeks (US-ACH-04); `{ calmMode: true }` hides it (US-ACH-08). */
export function loadRhythm(
  api: string,
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<Response<RhythmAnswer>> {
  return call<RhythmAnswer>(
    fetchFn,
    `${api}/achievements/rhythm?timeZone=${encodeURIComponent(currentTimeZone())}`,
    token,
  );
}
