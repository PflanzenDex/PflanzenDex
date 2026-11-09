import { useEffect } from "react";
import { lazyPage } from "@/shared/platform/routing/lazy-page/lazy-page";
import {
  preloadWhenIdle,
  usePreloadOnIntent,
  type Preloadable,
} from "@/shared/platform/routing/lazy-page/preload";
import { PATHS } from "@/shared/patterns/navigation/navigation/navigation";
import { AddPlant, ContextHint, TodayIntro } from "@/app/flows";
import { CollectionPage, HintsPage, PlantsViewLayer } from "@/collection";
import { DiscoverPage } from "@/discover";
import { PlanLayer, TreatmentsPage } from "@/care";
import { WateringList } from "@/monitoring";
import { TodayPage } from "@/today";
import { FriendsBanner, FriendsNewsTile, FriendsPage } from "@/social";

/** The destinations "Heute" and "Konto" with their sections are their own lazy parts: the shell does not carry them (DS-08, US-QS-14). */
export const TodayArea = lazyPage(() =>
  import("../today-area/today-area").then((m) => ({ default: m.TodayArea })),
);
export const AccountArea = lazyPage(() =>
  import("../account-area/account-area").then((m) => ({ default: m.AccountArea })),
);
/** The destination "Sammlung" with its three modes is a lazy part too; every mode loads when chosen (DS-08, US-QS-14). */
export const CollectionArea = lazyPage(() =>
  import("@/app/destinations/collection-area/collection-area").then((m) => ({
    default: m.CollectionArea,
  })),
);
/** The destination "Entdecken" with its modes (suggestions, catalog) is a lazy part too; every mode loads when chosen (DS-08, US-QS-14). */
export const DiscoverArea = lazyPage(() =>
  import("../discover-area/discover-area").then((m) => ({ default: m.DiscoverArea })),
);
/** The one-time hint of "Heute" after an update (US-DEV-06): a lazy part, so its lines load beside "Heute", not with the shell. */
export const WhatsNewHint = lazyPage(() =>
  import("@/app/destinations/account-area/whats-new/whats-new-hint/whats-new-hint").then((m) => ({
    default: m.WhatsNewHint,
  })),
);
/** "Freunde" in the calm mode of its settings (US-TAU-07, US-QS-20): its own lazy part (DS-08, QG-U6, see `calm-gate.tsx`). */
export const CalmGate = lazyPage(() => import("./simple-routes/calm-gate/calm-gate"));

/** The destinations of the bottom bar with the pages they render on a first visit, and the new-plant form (issue 1645). */
type PreloadKey = "today" | "collection" | "discover" | "friends" | "account" | "addPlant";

/**
 * The pages each destination renders on its first visit, in the order they are wanted. A function, so the list is read
 * after every module has loaded: the barrels import the frame and the flows, which import this file.
 */
function destinationPages(): Record<PreloadKey, readonly Preloadable[]> {
  return {
    today: [
      TodayArea,
      TodayPage,
      TodayIntro,
      WhatsNewHint,
      FriendsBanner,
      FriendsNewsTile,
      TreatmentsPage,
      PlanLayer,
      WateringList,
      HintsPage,
    ],
    collection: [CollectionArea, CollectionPage, PlantsViewLayer, ContextHint],
    discover: [DiscoverArea, DiscoverPage],
    friends: [CalmGate, FriendsPage],
    account: [AccountArea],
    addPlant: [AddPlant],
  };
}

/** The address of each destination in the bottom bar, to find its pages from a pressed link. */
const KEY_OF_ADDRESS = new Map<string, PreloadKey>([
  [PATHS.today, "today"],
  [PATHS.collection, "collection"],
  [PATHS.discover, "discover"],
  [PATHS.friends, "friends"],
  [PATHS.account, "account"],
]);

/** The pages of a link's address, when the address is one of the destinations (a stable function for the hook). */
function pagesOfAddress(href: string): readonly Preloadable[] | undefined {
  const key = KEY_OF_ADDRESS.get(href);
  return key === undefined ? undefined : destinationPages()[key];
}

/**
 * Requests the pages of the destinations once the shell is idle, in the order of the bottom bar, and the pages of one
 * destination as soon as its link is pressed or focused, so a tap that comes first does not wait for its chunk (US-QS-07,
 * issue 1645). It renders nothing.
 */
export function useDestinationPreload(): void {
  useEffect(() => preloadWhenIdle(Object.values(destinationPages())), []);
  usePreloadOnIntent(pagesOfAddress);
}
