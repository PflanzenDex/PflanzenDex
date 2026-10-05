// Public interface of the `light` module (ADR 0003): page for light zones and locations.
import { lazyPage } from "@/components/routing/lazy-page/lazy-page";
export const LightPage = lazyPage(() =>
  import("./LightPage").then((m) => ({ default: m.LightPage })),
);
export { loadLocations, loadZones } from "./light-api";
export { LocationsStep, ZonesStep } from "./setup-steps";
