// Public interface of the `light` module (ADR 0003): page for light zones and locations.
import { lazyPage } from "@/components/routing/lazy-page/lazy-page";
export const LightPage = lazyPage(() =>
  import("./LightPage").then((m) => ({ default: m.LightPage })),
);
export { loadLocations, loadZones } from "./light-api";
/** The onboarding steps carry the forms (validation, form library): their chunk loads when a step opens (#451). */
export const LocationsStep = lazyPage(() =>
  import("./setup-steps").then((m) => ({ default: m.LocationsStep })),
);
export const ZonesStep = lazyPage(() =>
  import("./setup-steps").then((m) => ({ default: m.ZonesStep })),
);
