import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Pool } from "pg";
import { COLLECTION_REPOINTERS } from "@pflanzendex/db";
import { ALL_FEATURES } from "@pflanzendex/core";
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
  specimenZoneUsageFor,
  specimenRoutes,
} from "./collection";
import { SPECIES_PATHS, REVIEW_PATHS, speciesRoutes, reviewRoutes } from "./catalog";
import { wishZoneUsageFor } from "./wishlist";
import { equipmentZoneUsageFor } from "./equipment";
import { bindFriends } from "./friends-bindings";
import { featureAccess, type FeatureAccess } from "./kernel";
import { bindHealth } from "./health";
import { LIGHT_PATHS, lightRoutes } from "./light";
import { POKEDEX_PATHS, pokedexRoutes } from "./pokedex";
import { achievementsRoutes } from "./achievements";
import { discoverRoutes, discoverSourceFor } from "./discover";
import { monitoringRoutes } from "./monitoring";
import { deletionRoutes, exportRoutes } from "./privacy";
import { aiAccessRoutes } from "./ai";
import type { AppOptions } from "./app-options";
import {
  bindCareOne,
  bindEquipment,
  bindToday,
  bindWishlist,
  careOptions,
  careSources,
  todaySources,
} from "./app-bindings";
import { measurementPhotoSourceFor, targetLocationFor } from "./care";
import { todayStatusSource } from "./today";

export type { AppOptions } from "./app-options";

/** The module `account`: registration (before the guard, no account yet), the guard itself, own account, operator area. */
function bindAccount(
  app: Hono,
  verifier: TokenVerifier,
  pool: Pool,
  opt: AppOptions & { access: FeatureAccess },
) {
  const auth = authentication(
    verifier,
    pool,
    opt.invitationOnly === undefined ? {} : { invitationOnly: opt.invitationOnly },
  );
  app.route("/", registrationRoutes(pool, verifier));
  app.use("/account", auth);
  app.use("/account/*", auth);
  app.route("/account", accountRoutes(pool, opt.access));
  app.route("/account", exportRoutes(pool, opt.media?.store));
  app.route("/account", deletionRoutes(pool, opt.clock));
  for (const path of OPERATOR_PATHS) app.use(path, auth).use(`${path}/*`, auth);
  app.route("/", operatorRoutes(pool, opt.clock));
  return auth;
}

/** The protected routes of all modules behind the sign-in guard. */
function bindApi(app: Hono, opt: AppOptions, reviewer: TokenVerifier, pool: Pool) {
  const features = featureAccess(pool, opt.features ?? ALL_FEATURES);
  const auth = bindAccount(app, reviewer, pool, { ...opt, access: features });
  for (const path of LIGHT_PATHS) app.use(path, auth).use(`${path}/*`, auth);
  app.route(
    "/",
    lightRoutes(pool, [
      careProfileZoneUsageFor(pool),
      specimenZoneUsageFor(pool),
      wishZoneUsageFor(pool),
      equipmentZoneUsageFor(pool),
    ]),
  );
  for (const path of SPECIES_PATHS) app.use(path, auth).use(`${path}/*`, auth);
  app.route("/", speciesRoutes(pool));
  for (const path of REVIEW_PATHS) app.use(path, auth).use(`${path}/*`, auth);
  app.route("/", reviewRoutes(pool, COLLECTION_REPOINTERS));
  for (const path of SPECIMEN_PATHS) app.use(path, auth).use(`${path}/*`, auth);
  app.route("/", specimenRoutes(pool, { clock: opt.clock, ...careSources(pool, opt) }));
  for (const path of POKEDEX_PATHS) app.use(path, auth).use(`${path}/*`, auth);
  app.route("/", pokedexRoutes(pool));
  app.route("/", discoverRoutes(pool, auth, opt.zoneStock));
  app.route("/", achievementsRoutes(pool, auth, opt.clock));
  app.route("/", monitoringRoutes(pool, auth));
  for (const path of CARE_PROFILE_PATHS) app.use(path, auth).use(`${path}/*`, auth);
  app.route("/", careProfileRoutes(pool));
  bindWishlist(app, pool, auth, opt);
  bindEquipment(app, pool, auth, { zoneStock: opt.zoneStock, features, products: opt.products });
  const clock = opt.clock ? { clock: opt.clock } : {};
  bindFriends(app, pool, auth, {
    ...clock,
    targetLocation: opt.targetLocation ?? targetLocationFor(pool),
    features,
  });
  const care = careOptions(opt);
  bindCareOne(app, pool, auth, care);
  const today = { ...care, ...todaySources(pool, opt) };
  bindToday(app, pool, auth, today);
  app.route(
    "/",
    aiAccessRoutes(pool, auth, opt.ai && { ...opt.ai, features }, {
      status: todayStatusSource(pool, today),
      photo: measurementPhotoSourceFor(pool, opt.media),
      discover: discoverSourceFor(pool, opt.zoneStock),
      ...(opt.wishImage ? { sources: opt.wishImage.sources } : {}),
    }),
  );
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
        exposeHeaders: ["Content-Disposition", "X-Missing-Photos"],
      }),
    );
  bindHealth(app, { pool: opt.pool, version, commit, storage: opt.media !== undefined });
  if (opt.reviewer && opt.pool) bindApi(app, opt, opt.reviewer, opt.pool);
  return app;
}
