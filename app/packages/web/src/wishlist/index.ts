// Public interface of the `wishlist` module (ADR 0003): the page with the prioritized candidates.
import { lazyPage } from "@/lib/lazy-page";
export const WishlistPage = lazyPage(() =>
  import("./WishlistPage").then((m) => ({ default: m.WishlistPage })),
);
