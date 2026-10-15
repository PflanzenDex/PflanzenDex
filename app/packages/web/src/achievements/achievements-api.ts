import { call, createWrite, type Response } from "../kernel";

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
