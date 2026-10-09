// Public interface of the `wishlist` module (ADR 0003): wish routes and the zone usage of the wishes.
export { WISH_PATHS, wishRoutes, wishZoneUsageFor } from "./wishlist-routes";
export type { WishImageSources } from "./wishlist-routes";
export { createWikimediaDownload } from "./wish-image";
