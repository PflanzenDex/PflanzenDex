import type { ReactNode } from "react";
import {
  EXCHANGE_PATH,
  MATCH_PATH,
  PATHS,
  PROFILE_BASE,
} from "@/shared/patterns/navigation/navigation/navigation";
import { readStored } from "@/shared/platform/browser/storage";
import { TodaySkeleton } from "@/today";
import { ProfileRouteSkeleton } from "@/catalog";
import { FriendCollectionRouteSkeleton, FriendsRouteSkeleton } from "@/social";
import { ExchangeRouteSkeleton, MatchRouteSkeleton } from "@/swap";
import { AccountRouteSkeleton } from "@/app/destinations/account-area/account-area.skeleton";
import { sectionOf } from "@/app/destinations/account-area/account-model/account-model";
import { CollectionRouteSkeleton } from "@/app/destinations/collection-area/collection-area.skeleton";
import { DiscoverRouteSkeleton } from "@/app/destinations/discover-area/discover-area.skeleton";
import {
  DISCOVER_VIEW_KEY,
  discoverViewOf,
  useSuggestionsOn,
} from "@/app/destinations/discover-area/discover-view";
import { VIEW_KEY, sammlungShapeOf, useOfferedView, type SammlungView } from "@/app/sammlung-view";

/** What the fallback reads from the shell: whether the suggestions are offered (US-ENT, US-ONB-09) and which modes of "Sammlung" are. */
export type FallbackState = {
  suggestionsOn: boolean;
  offered: (v: SammlungView) => boolean;
};

/** The fallback of the address the shell shows now, with the switches it reads (see `routeFallbackOf`). */
export function useRouteFallback(pathname: string, search: string): ReactNode | undefined {
  const suggestionsOn = useSuggestionsOn();
  const offered = useOfferedView();
  return routeFallbackOf(pathname, search, { suggestionsOn, offered });
}

/**
 * The fallback of a route's Suspense boundary (US-QS-14, issues 1697 and 1727): "Heute", "Entdecken", "Sammlung", "Freunde",
 * the exchange, the match deck, a friend's collection, the species profile, and "Konto" show the shape of their page before
 * their part is there, the mode or section the address names included. Other routes keep the generic page skeleton of the
 * route boundary (`undefined`).
 */
export function routeFallbackOf(
  pathname: string,
  search: string,
  state: FallbackState,
): ReactNode | undefined {
  if (pathname === PATHS.today) return <TodaySkeleton />;
  if (pathname === PATHS.discover)
    return (
      <DiscoverRouteSkeleton
        view={discoverViewOf(search, readStored(DISCOVER_VIEW_KEY) ?? null, state.suggestionsOn)}
      />
    );
  if (pathname === PATHS.collection)
    return (
      <CollectionRouteSkeleton
        shape={sammlungShapeOf(search, readStored(VIEW_KEY) ?? null, state.offered)}
      />
    );
  if (pathname === PATHS.friends) return <FriendsRouteSkeleton />;
  // The exchange and the match deck are addresses of their own below "Freunde": they come before the friend's collection.
  if (pathname === EXCHANGE_PATH) return <ExchangeRouteSkeleton />;
  if (pathname === MATCH_PATH) return <MatchRouteSkeleton />;
  if (pathname.startsWith(`${PATHS.friends}/`)) return <FriendCollectionRouteSkeleton />;
  if (pathname.startsWith(`${PROFILE_BASE}/`)) return <ProfileRouteSkeleton />;
  if (pathname.startsWith(PATHS.account))
    return <AccountRouteSkeleton section={sectionOf(pathname)} />;
  return undefined;
}
