import { useAchievementsVisible } from "@/achievements";
import { MatchPage } from "@/swap";

/**
 * The match deck without counters while calm mode is on or not yet known (US-TAU-07, US-ACH-08). Its own lazy part
 * (see `lazy-areas.ts`): the route only knows the settings through this file, so they stay out of the first load (DS-08).
 */
export function MatchRoute(props: { api: string; token: () => Promise<string | undefined> }) {
  const calm = !useAchievementsVisible(props.api, props.token);
  return <MatchPage {...props} calm={calm} />;
}
