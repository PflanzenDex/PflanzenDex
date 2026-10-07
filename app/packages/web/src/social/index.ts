// Public interface of the `social` module (ADR 0003): the page "Freunde" (US-SOZ-01, US-SOZ-02). It loads with its route (DS-08).
import { lazyPage } from "@/components/routing/lazy-page/lazy-page";
export const FriendsPage = lazyPage(() =>
  import("./friends-page/friends-page").then((m) => ({ default: m.FriendsPage })),
);
// The banner "Friends have N new plants" (US-SOZ-06) is shown on the start page: a small component, imported directly so
// the start page never suspends while it loads.
export { FriendsBanner } from "./feed/friends-banner/friends-banner";
