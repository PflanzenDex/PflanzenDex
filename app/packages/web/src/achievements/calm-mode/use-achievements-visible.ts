import { useCalmMode } from "./use-calm-mode";

/**
 * Whether the game elements are shown (US-ACH-08): only once the setting is known and calm mode is off. While it loads
 * or if it cannot be read, nothing shows (no flash of game elements for a keeper in calm mode, no error for a
 * side feature).
 */
export function useAchievementsVisible(
  api: string,
  token: () => Promise<string | undefined>,
): boolean {
  const calm = useCalmMode(api, token);
  return calm !== undefined && !calm;
}
