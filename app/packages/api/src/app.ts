import { Hono, type MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import type { Pool } from "pg";
import { COLLECTION_REPOINTERS } from "@pflanzendex/db";
import {
  productTitle,
  type TreatmentSource,
  type MeasurementSource,
  type TargetLocationSource,
  type PhaseLocationSource,
  type ZoneStockSource,
  type ObjectStore,
  type ImageProcessor,
} from "@pflanzendex/core";
import {
  OPERATOR_PATHS,
  accountRoutes,
  authentication,
  operatorRoutes,
  registrationRoutes,
  type TokenVerifier,
} from "./account";
import {
  CARE_PROFILE_PATHS,
  SPECIMEN_PATHS,
  careProfileRoutes,
  careProfileZoneUsageFor,
  specimenRoutes,
} from "./collection";
import { SPECIES_PATHS, REVIEW_PATHS, speciesRoutes, reviewRoutes } from "./catalog";
import { WISH_PATHS, wishRoutes, wishZoneUsageFor } from "./wishlist";
import {
  FEED_PATHS,
  FRIEND_PATHS,
  SHARING_PATHS,
  feedRoutes,
  friendRoutes,
  sharingRoutes,
} from "./social";
import { zoneStockFor } from "./zone-stock";
import { LIGHT_PATHS, lightRoutes } from "./light";
import { POKEDEX_PATHS, pokedexRoutes } from "./pokedex";
import { discoverRoutes } from "./discover";
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
import { TODAY_PATHS, todayRoutes } from "./today";

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
  /** Forces the registration mode (tests only); without it the setting of the operator decides (US-ACC-05). */
  invitationOnly?: boolean;
  /** The clock for "today" (NFR-08); defaults to system time. */
  clock?: () => Date;
  /** Replaces the care profile as source of the target location of new specimens (tests). */
  targetLocation?: TargetLocationSource;
  /** Measurements and treatments for the specimen cards (US-BES-06); without it `care` supplies the measurements (WAC-01) and the planned treatments (BEH-01). */
  measurements?: MeasurementSource;
  treatments?: TreatmentSource;
  /** Object store and image processing for measurement photos (US-WAC-06); without them uploading a photo answers 502. */
  media?: { store: ObjectStore; processor: ImageProcessor };
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
function bindToday(
  app: Hono,
  pool: Pool,
  auth: MiddlewareHandler,
  opt: { clock?: () => Date; phaseLocation?: PhaseLocationSource },
) {
  for (const path of TODAY_PATHS) app.use(path, auth).use(`${path}/*`, auth);
  app.route("/", todayRoutes(pool, opt));
}

/** The module `wishlist`: sign-in guard in front of the paths, then the routes; the stock per zone comes from `collection` unless tests replace it. */
function bindWishlist(app: Hono, pool: Pool, auth: MiddlewareHandler, zoneStock?: ZoneStockSource) {
  for (const path of WISH_PATHS) app.use(path, auth).use(`${path}/*`, auth);
  app.route("/", wishRoutes(pool, zoneStock ?? zoneStockFor(pool)));
}

/** The module `social` (friends by invitation): sign-in guard in front of the paths, then the routes. */
function bindFriends(app: Hono, pool: Pool, auth: MiddlewareHandler, clock?: () => Date) {
  for (const path of [...FRIEND_PATHS, ...SHARING_PATHS, ...FEED_PATHS])
    app.use(path, auth).use(`${path}/*`, auth);
  app.route("/", friendRoutes(pool, clock));
  app.route("/", sharingRoutes(pool));
  app.route("/", feedRoutes(pool, clock));
}

/** What `care` takes from the app options: clock, location per phase and the media port (photos, US-WAC-06). */
function careOptions(opt: AppOptions) {
  return {
    ...(opt.clock ? { clock: opt.clock } : {}),
    ...(opt.phaseLocation ? { phaseLocation: opt.phaseLocation } : {}),
    ...(opt.media ? { media: opt.media } : {}),
  };
}

/** What `care` feeds into the collection: target location, measurements and treatments, unless tests replace them. */
function careSources(pool: Pool, opt: AppOptions) {
  return {
    targetLocation: opt.targetLocation ?? targetLocationFor(pool),
    measurements: opt.measurements ?? measurementSourceFor(pool),
    treatments: opt.treatments ?? treatmentSourceFor(pool),
  };
}

/** The module `account`: registration (before the guard, no account yet), the guard itself, own account, operator area. */
function bindAccount(app: Hono, verifier: TokenVerifier, pool: Pool, opt: AppOptions) {
  const auth = authentication(
    verifier,
    pool,
    opt.invitationOnly === undefined ? {} : { invitationOnly: opt.invitationOnly },
  );
  app.route("/", registrationRoutes(pool, verifier));
  app.use("/account", auth);
  app.use("/account/*", auth);
  app.route("/account", accountRoutes(pool));
  for (const path of OPERATOR_PATHS) app.use(path, auth).use(`${path}/*`, auth);
  app.route("/", operatorRoutes(pool, opt.clock));
  return auth;
}

export function createApp(opt: AppOptions = {}): Hono {
  const { version = "unknown", commit = "unknown" } = opt;
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
    const auth = bindAccount(app, opt.reviewer, opt.pool, opt);
    for (const path of LIGHT_PATHS) app.use(path, auth).use(`${path}/*`, auth);
    app.route(
      "/",
      lightRoutes(opt.pool, [careProfileZoneUsageFor(opt.pool), wishZoneUsageFor(opt.pool)]),
    );
    for (const path of SPECIES_PATHS) app.use(path, auth).use(`${path}/*`, auth);
    app.route("/", speciesRoutes(opt.pool));
    for (const path of REVIEW_PATHS) app.use(path, auth).use(`${path}/*`, auth);
    app.route("/", reviewRoutes(opt.pool, COLLECTION_REPOINTERS));
    for (const path of SPECIMEN_PATHS) app.use(path, auth).use(`${path}/*`, auth);
    app.route("/", specimenRoutes(opt.pool, { clock: opt.clock, ...careSources(opt.pool, opt) }));
    for (const path of POKEDEX_PATHS) app.use(path, auth).use(`${path}/*`, auth);
    app.route("/", pokedexRoutes(opt.pool));
    app.route("/", discoverRoutes(opt.pool, auth));
    for (const path of CARE_PROFILE_PATHS) app.use(path, auth).use(`${path}/*`, auth);
    app.route("/", careProfileRoutes(opt.pool));
    bindWishlist(app, opt.pool, auth, opt.zoneStock);
    bindFriends(app, opt.pool, auth, opt.clock);
    const care = careOptions(opt);
    bindCareOne(app, opt.pool, auth, care);
    bindToday(app, opt.pool, auth, care);
  }
  return app;
}
