// Public interface of the `social` module (ADR 0003): the page "Freunde" (US-SOZ-01, US-SOZ-02). It loads with its route (DS-08).
import { lazyPage } from "@/components/routing/lazy-page/lazy-page";
export const FriendsPage = lazyPage(() =>
  import("./friends-page/friends-page").then((m) => ({ default: m.FriendsPage })),
);
