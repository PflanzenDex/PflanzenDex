import { Hono, type MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import type { Pool } from "pg";
import {
  productTitle,
  type TreatmentSource,
  type MeasurementSource,
  type TargetLocationSource,
  type PhaseLocationSource,
  type ZoneStockSource,
} from "@pflanzendex/core";
import { authentication, accountRoutes, type TokenVerifier } from "./account";
import {
  CARE_PROFILE_PATHS,
  SPECIMEN_PATHS,
  careProfileRoutes,
  careProfileZoneUsageFor,
  specimenRoutes,
} from "./collection";
import { SPECIES_PATHS, speciesRoutes } from "./catalog";
import { WISH_PATHS, wishRoutes, wishZoneUsageFor } from "./wishlist";
import { zoneStockFor } from "./zone-stock";
import { LIGHT_PATHS, lightRoutes } from "./light";
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

export type AppOptions = {
  /** Verifies access tokens of the sign-in service; without it there are no protected routes. */
  reviewer?: TokenVerifier;
  pool?: Pool;
  /** Origin of the web app for CORS (the API sets no cookies, sign-in runs via bearer token). */
  webOrigin?: string;
  /** Version of the running build: `git describe --tags --always`, e.g. v0.1.0 or v0.1.0-3-gabc1234 (from the build, not secret). */
  version?: string | undefined;
  /** Short commit hash of the running build (from the build, not secret). */
  commit?: string | undefined;
  /** The clock for "today" (NFR-08); defaults to system time. */
  clock?: () => Date;
  /** Replaces the care profile as source of the target location of new specimens (tests). */
  targetLocation?: TargetLocationSource;
  /** Measurements and treatments for the specimen cards (US-BES-06); without it `care` supplies the measurements (WAC-01) and the planned treatments (BEH-01). */
  measurements?: MeasurementSource;
  treatments?: TreatmentSource;
  /** Replaces the care profile as source of the location per phase (tests); without it the keeper's own care profile (US-BES-09) answers. */
  phaseLocation?: PhaseLocationSource;
  /** Replaces the light distribution as source of the stock per zone for the wishlist (tests); without it `collection` answers (US-LIC-02). */
  zoneStock?: ZoneStockSource;
};

/** The module `care` (measurements, care phases and treatments): sign-in guard in front of the paths, then the routes. */
function bindCareOne(
  app: Hono,
  pool: Pool,
  auth: MiddlewareHandler,
  opt: { clock?: () => Date; phaseLocation?: PhaseLocationSource },
) {
  for (const path of CARE_PATHS) app.use(path, auth);
  app.route("/", careRoutes(pool, opt));
  for (const path of CARE_PHASES_PATHS) app.use(path, auth).use(`${path}/*`, auth);
  app.route("/", carePhasesRoutes(pool, opt));
  for (const path of TREATMENT_PATHS) app.use(path, auth).use(`${path}/*`, auth);
  app.route("/", treatmentRoutes(pool, opt));
}

/** What `care` feeds into the collection: target location, measurements and treatments, unless tests replace them. */
function careSources(pool: Pool, opt: AppOptions) {
  return {
    targetLocation: opt.targetLocation ?? targetLocationFor(pool),
    measurements: opt.measurements ?? measurementSourceFor(pool),
    treatments: opt.treatments ?? treatmentSourceFor(pool),
  };
}

export function createApp(opt: AppOptions = {}): Hono {
  const version = opt.version ?? "unknown";
  const commit = opt.commit ?? "unknown";
  const app = new Hono();
  if (opt.webOrigin)
    app.use(
      "*",
      cors({
        origin: opt.webOrigin,
        allowHeaders: ["Authorization", "Content-Type", "Idempotency-Key"],
      }),
    );
  app.get("/health", (c) => c.json({ status: "ok", product: productTitle(), version, commit }));
  if (opt.reviewer && opt.pool) {
    const auth = authentication(opt.reviewer, opt.pool);
    app.use("/account", auth);
    app.use("/account/*", auth);
    app.route("/account", accountRoutes(opt.pool));
    for (const path of LIGHT_PATHS) app.use(path, auth).use(`${path}/*`, auth);
    app.route(
      "/",
      lightRoutes(opt.pool, [careProfileZoneUsageFor(opt.pool), wishZoneUsageFor(opt.pool)]),
    );
    for (const path of SPECIES_PATHS) app.use(path, auth).use(`${path}/*`, auth);
    app.route("/", speciesRoutes(opt.pool));
    for (const path of SPECIMEN_PATHS) app.use(path, auth).use(`${path}/*`, auth);
    app.route("/", specimenRoutes(opt.pool, { clock: opt.clock, ...careSources(opt.pool, opt) }));
    for (const path of CARE_PROFILE_PATHS) app.use(path, auth).use(`${path}/*`, auth);
    app.route("/", careProfileRoutes(opt.pool));
    for (const path of WISH_PATHS) app.use(path, auth).use(`${path}/*`, auth);
    app.route("/", wishRoutes(opt.pool, opt.zoneStock ?? zoneStockFor(opt.pool)));
    bindCareOne(app, opt.pool, auth, {
      ...(opt.clock ? { clock: opt.clock } : {}),
      ...(opt.phaseLocation ? { phaseLocation: opt.phaseLocation } : {}),
    });
  }
  return app;
}
