import { useCallback } from "react";
import { useRequest } from "../../shared/data";
import { loadAchievementSettings } from "../achievements-api";

/**
 * The calm mode setting (US-ACH-08) in three states: `true` in calm mode, `false` when the game elements show, and
 * `undefined` while it loads or when it cannot be read. Every part that must wait for the setting reads it here, so the
 * request is made once per key (US-QS-27, the banner of "Heute", and the game elements).
 */
export function useCalmMode(
  api: string,
  token: () => Promise<string | undefined>,
): boolean | undefined {
  const load = useCallback((t: string) => loadAchievementSettings(api, t), [api]);
  const r = useRequest({ queryKey: ["achievements", "settings"], token, load });
  return r.value === undefined ? undefined : r.value.calmMode;
}
