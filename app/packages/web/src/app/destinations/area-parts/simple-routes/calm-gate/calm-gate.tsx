import type { ComponentType } from "react";
import { useAchievementsVisible } from "@/achievements";

type Props = { api: string; token: () => Promise<string | undefined> };

/**
 * Renders `page` with `calm`: whether calm mode hides the counters (US-ACH-08), also while the setting is not known yet.
 * Used by the match deck (US-TAU-07) and the tiles of "Freunde" (US-QS-20). Its own lazy part (see `lazy-areas.ts`): the
 * routes only know the settings through this file, so they stay out of the first load (DS-08, QG-U6). It imports no page
 * itself, so it adds no module to this part.
 */
export default function CalmGate<P extends Props>(
  props: { page: ComponentType<P & { calm: boolean }> } & P,
) {
  const { page: Page, ...rest } = props;
  const calm = !useAchievementsVisible(props.api, props.token);
  return <Page {...(rest as unknown as P)} calm={calm} />;
}
