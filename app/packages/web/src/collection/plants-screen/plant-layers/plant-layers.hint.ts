import { useEffect, useEffectEvent } from "react";
import type { PlantHintOccasion, PlantSlots } from "./layer-ids";

/**
 * Starts the request of the calm hint when the plants show (US-ONB-07, US-QS-23, issue 2384): the plant layer that opens
 * later finds the answer and shows its note on its first render, so it does not grow when the note arrives. It runs when
 * the occasions that apply change, not when the app hands in a new slot object (an effect event reads the latest).
 *
 * It asks for every account that has an occasion, also for style `many` and calm mode, where the server picks no hint: the
 * client does not know the style (only the settings page reads it), so the answer is "none" and costs one small request.
 */
export function useHintPrefetch(
  prefetch: PlantSlots["hintPrefetch"],
  occasions: readonly PlantHintOccasion[],
) {
  const start = useEffectEvent(() => prefetch?.(occasions));
  const key = occasions.join(",");
  useEffect(() => {
    if (key !== "") start();
  }, [key]);
}
