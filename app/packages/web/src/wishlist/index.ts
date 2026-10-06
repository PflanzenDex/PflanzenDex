// Public interface of the `wishlist` module (ADR 0003): the page with the prioritized candidates.
import { lazyPage } from "@/components/routing/lazy-page/lazy-page";
export const WishlistPage = lazyPage(() =>
  import("./WishlistPage").then((m) => ({ default: m.WishlistPage })),
);
// The app wires the way from a bought wish to its specimen (US-WUN-05); the parts load when the way is used, so the
// entry bundle stays small (DS-08).
export const PathNotes = lazyPage(() =>
  import("./actions/actions").then((m) => ({ default: m.PathNotes })),
);
export const linkWishSpecimen = async (
  ...args: Parameters<typeof import("./wishlist-api").linkWishSpecimen>
) => (await import("./wishlist-api")).linkWishSpecimen(...args);
export type { PathNotice, WishToPlant } from "./actions/actions";
