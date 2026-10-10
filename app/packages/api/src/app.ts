import { Hono, type MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import type { Pool } from "pg";
import { COLLECTION_REPOINTERS } from "@pflanzendex/db";
import { type PhaseLocationSource, type ObjectStore, type ImageProcessor } from "@pflanzendex/core";
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
import { provenanceSourceFor } from "./swap";
import { WISH_PATHS, wishRoutes, wishZoneUsageFor } from "./wishlist";
import { bindFriends } from "./friends-bindings";
import { zoneStockFor } from "./zone-stock";
import { bindHealth } from "./health";
import { LIGHT_PATHS, lightRoutes } from "./light";
import { POKEDEX_PATHS, pokedexRoutes } from "./pokedex";
import { discoverRoutes } from "./discover";
import { monitoringRoutes } from "./monitoring";
import { aiAccessRoutes } from "./ai";
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
import { TODAY_PATHS, todayRoutes, todayStatusSource, type TodayOptions } from "./today";

export type { AppOptions } from "./app-options";

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
function bindToday(app: Hono, pool: Pool, auth: MiddlewareHandler, opt: TodayOptions) {
  for (const path of TODAY_PATHS) app.use(path, auth).use(`${path}/*`, auth);
  app.route("/", todayRoutes(pool, opt));
}

/** What "Today" reads from `care` and `wishlist` (US-QS-04): last measurements and the stock per zone, unless tests replace them. */
function todaySources(pool: Pool, opt: AppOptions) {
  return {
    measurements: opt.measurements ?? measurementSourceFor(pool),
    zoneStock: opt.zoneStock ?? zoneStockFor(pool),
  };
}

/** The module `wishlist`: sign-in guard in front of the paths, then the routes; the stock per zone comes from `collection` unless tests replace it. */
function bindWishlist(app: Hono, pool: Pool, auth: MiddlewareHandler, opt: AppOptions) {
  for (const path of WISH_PATHS) app.use(path, auth).use(`${path}/*`, auth);
  const image = opt.wishImage && opt.media ? { ...opt.wishImage, media: opt.media } : undefined;
  app.route("/", wishRoutes(pool, opt.zoneStock ?? zoneStockFor(pool), image));
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
    provenance: opt.provenance ?? provenanceSourceFor(pool),
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
  bindHealth(app, { pool: opt.pool, version, commit, storage: opt.media !== undefined });
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
    app.route("/", discoverRoutes(opt.pool, auth, opt.zoneStock));
    app.route("/", monitoringRoutes(opt.pool, auth));
    for (const path of CARE_PROFILE_PATHS) app.use(path, auth).use(`${path}/*`, auth);
    app.route("/", careProfileRoutes(opt.pool));
    bindWishlist(app, opt.pool, auth, opt);
    bindFriends(app, opt.pool, auth, {
      ...(opt.clock ? { clock: opt.clock } : {}),
      targetLocation: opt.targetLocation ?? targetLocationFor(opt.pool),
    });
    const care = careOptions(opt);
    bindCareOne(app, opt.pool, auth, care);
    const today = { ...care, ...todaySources(opt.pool, opt) };
    bindToday(app, opt.pool, auth, today);
    app.route("/", aiAccessRoutes(opt.pool, auth, opt.ai, todayStatusSource(opt.pool, today)));
  }
  return app;
}
