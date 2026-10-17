// Public interface of the `social` module (ADR 0003): the page "Freunde" (US-SOZ-01, US-SOZ-02). It loads with its route (DS-08).
import { lazyPage } from "@/components/routing/lazy-page/lazy-page";
export const FriendsPage = lazyPage(() =>
  import("./pages/friends-page/friends-page").then((m) => ({ default: m.FriendsPage })),
);
export const FriendCollectionPage = lazyPage(() =>
  import("./pages/friend-collection/friend-collection").then((m) => ({
    default: m.FriendCollectionPage,
  })),
);
// The banner "Friends have N new plants" (US-SOZ-06) is shown on the start page; its chunk loads after the page, so the
// initial bundle stays small (DS-08). The start page renders it inside its own `Suspense` with no fallback.
export const FriendsBanner = lazyPage(() =>
  import("./feed/friends-banner/friends-banner").then((m) => ({ default: m.FriendsBanner })),
);
