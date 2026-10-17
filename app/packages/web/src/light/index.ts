// Public interface of the `light` module (ADR 0003): page for light zones and locations.
import { lazyPage } from "@/components/routing/lazy-page/lazy-page";
export const LightPage = lazyPage(() =>
  import("./light-page/light-page").then((m) => ({ default: m.LightPage })),
);
export { loadLocations, loadZones } from "./shared/light-api/light-api";
