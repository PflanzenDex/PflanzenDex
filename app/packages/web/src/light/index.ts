// Public interface of the `light` module (ADR 0003): page for light zones and locations.
import { lazyPage } from "@/shared/platform/routing/lazy-page/lazy-page";
export const LightPage = lazyPage(() =>
  import("./light-page/light-page").then((m) => ({ default: m.LightPage })),
);
export { loadZones } from "./shared/light-api/light-api";
export {
  ZONES_KEY,
  refreshLight,
  sharedLocations,
  sharedZones,
} from "./shared/light-api/light-shared";
// The skeleton of the locations and light zones, shown while they are managed in "Sammlung" (US-QS-14, issue 1727).
export { LightPageSkeleton } from "./light-page/light-page.skeleton";
