import type { Hono, MiddlewareHandler } from "hono";
import type { Pool } from "pg";
import type {
  PhaseLocationSource,
  ObjectStore,
  ImageProcessor,
  ZoneStockSource,
} from "@pflanzendex/core";
import { provenanceSourceFor } from "./swap";
import { WISH_PATHS, wishRoutes } from "./wishlist";
import { EQUIPMENT_PATHS, equipmentRoutes } from "./equipment";
import { zoneStockFor } from "./zone-stock";
import type { FeatureAccess } from "./kernel";
import type { AppOptions } from "./app-options";
import {
  CARE_PATHS,
  CARE_PHASES_PATHS,
  TREATMENT_PATHS,
  careRoutes,
  treatmentRoutes,
  carePhasesRoutes,
  measurementSourceFor,
  treatmentSourceFor,
  targetLocationFor,
} from "./care";
import { TODAY_PATHS, todayRoutes, type TodayOptions } from "./today";

/** The module `care` (measurements, care phases and treatments): sign-in guard in front of the paths, then the routes. */
export function bindCareOne(
  app: Hono,
  pool: Pool,
  auth: MiddlewareHandler,
  opt: {
    clock?: () => Date;
    phaseLocation?: PhaseLocationSource;
    media?: { store: ObjectStore; processor: ImageProcessor };
  },
) {
  for (const path of CARE_PATHS) app.use(path, auth);
  app.route("/", careRoutes(pool, opt));
  for (const path of CARE_PHASES_PATHS) app.use(path, auth).use(`${path}/*`, auth);
  app.route("/", carePhasesRoutes(pool, opt));
  for (const path of TREATMENT_PATHS) app.use(path, auth).use(`${path}/*`, auth);
  app.route("/", treatmentRoutes(pool, opt));
}

/** The module `today` (TE-07): sign-in guard in front of the path, then the read-only route. */
export function bindToday(app: Hono, pool: Pool, auth: MiddlewareHandler, opt: TodayOptions) {
  for (const path of TODAY_PATHS) app.use(path, auth).use(`${path}/*`, auth);
  app.route("/", todayRoutes(pool, opt));
}

/** What "Today" reads from `care` and `wishlist` (US-QS-04): last measurements and the stock per zone, unless tests replace them. */
export function todaySources(pool: Pool, opt: AppOptions) {
  return {
    measurements: opt.measurements ?? measurementSourceFor(pool),
    zoneStock: opt.zoneStock ?? zoneStockFor(pool),
  };
}

/** The module `wishlist`: sign-in guard in front of the paths, then the routes; the stock per zone comes from `collection` unless tests replace it. */
export function bindWishlist(app: Hono, pool: Pool, auth: MiddlewareHandler, opt: AppOptions) {
  for (const path of WISH_PATHS) app.use(path, auth).use(`${path}/*`, auth);
  const image = opt.wishImage && opt.media ? { ...opt.wishImage, media: opt.media } : undefined;
  app.route("/", wishRoutes(pool, opt.zoneStock ?? zoneStockFor(pool), image));
}

/** The module `equipment`: sign-in guard in front of the paths, then the routes (US-EQU-01). */
export function bindEquipment(
  app: Hono,
  pool: Pool,
  auth: MiddlewareHandler,
  opt: { zoneStock?: ZoneStockSource | undefined; features: FeatureAccess },
) {
  for (const path of EQUIPMENT_PATHS) app.use(path, auth).use(`${path}/*`, auth);
  app.route("/", equipmentRoutes(pool, opt.zoneStock ?? zoneStockFor(pool), opt.features));
}

/** What `care` takes from the app options: clock, location per phase and the media port (photos, US-WAC-06). */
export function careOptions(opt: AppOptions) {
  return {
    ...(opt.clock ? { clock: opt.clock } : {}),
    ...(opt.phaseLocation ? { phaseLocation: opt.phaseLocation } : {}),
    ...(opt.media ? { media: opt.media } : {}),
  };
}

/** What `care` feeds into the collection: target location, measurements and treatments, unless tests replace them. */
export function careSources(pool: Pool, opt: AppOptions) {
  return {
    targetLocation: opt.targetLocation ?? targetLocationFor(pool),
    measurements: opt.measurements ?? measurementSourceFor(pool),
    treatments: opt.treatments ?? treatmentSourceFor(pool),
    provenance: opt.provenance ?? provenanceSourceFor(pool),
  };
}
