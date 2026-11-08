import type { ReactNode } from "react";
import { PATHS } from "@/shared/patterns/navigation/navigation/navigation";
import { readStored } from "@/shared/platform/browser/storage";
import { TodaySkeleton } from "@/today";
import { AccountRouteSkeleton } from "@/app/destinations/account-area/account-area.skeleton";
import { sectionOf } from "@/app/destinations/account-area/account-model/account-model";
import { DiscoverRouteSkeleton } from "@/app/destinations/discover-area/discover-area.skeleton";
import { DISCOVER_VIEW_KEY, discoverViewOf } from "@/app/destinations/discover-area/discover-view";

/**
 * The fallback of a route's Suspense boundary (US-QS-14, issue 1697): "Heute", "Entdecken" and "Konto" show the shape of
 * their page before their part is there, the mode and section the address names included. Other routes keep the generic
 * page skeleton of the route boundary (`undefined`).
 */
export function routeFallbackOf(
  pathname: string,
  search: string,
  suggestionsOn: boolean,
): ReactNode | undefined {
  if (pathname === PATHS.today) return <TodaySkeleton />;
  if (pathname === PATHS.discover)
    return (
      <DiscoverRouteSkeleton
        view={discoverViewOf(search, readStored(DISCOVER_VIEW_KEY) ?? null, suggestionsOn)}
      />
    );
  if (pathname.startsWith(PATHS.account))
    return <AccountRouteSkeleton section={sectionOf(pathname)} />;
  return undefined;
}
