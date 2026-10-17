import { useCallback } from "react";
import { useRequest } from "../../kernel";
import { loadAchievementSettings } from "../achievements-api";

/**
 * Whether the game elements are shown (US-ACH-08): only once the setting is known and calm mode is off. While it loads
 * or if it cannot be read, nothing shows (no flash of game elements for a keeper in calm mode, no error for a
 * side feature).
 */
export function useAchievementsVisible(
  api: string,
  token: () => Promise<string | undefined>,
): boolean {
  const load = useCallback((t: string) => loadAchievementSettings(api, t), [api]);
  const r = useRequest({ queryKey: ["achievements", "settings"], token, load });
  return r.value !== undefined && !r.value.calmMode;
}
