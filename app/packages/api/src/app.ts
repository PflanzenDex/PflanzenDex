import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import type { Pool } from "pg";
import { COLLECTION_REPOINTERS, isDatabaseUnavailable } from "@pflanzendex/db";
import { ALL_FEATURES, appError } from "@pflanzendex/core";
import {
  OPERATOR_PATHS,
  accountRoutes,
  authentication,
  operatorRoutes,
  registrationRoutes,
  unlockRoutes,
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
import {
  CORRECTION_PATHS,
  GAP_PATHS,
  SPECIES_PATHS,
  REVIEW_PATHS,
  correctionRoutes,
  gapRoutes,
  speciesRoutes,
  reviewRoutes,
} from "./catalog";
import { wishZoneUsageFor } from "./wishlist";
import { equipmentLocationUsageFor, equipmentZoneUsageFor } from "./equipment";
import { bindFriends } from "./friends-bindings";
import {
  accountEtag,
  errorBody,
  featureAccess,
  redeemGate,
  runningVersion,
  statusFor,
  writeLimit,
  type FeatureAccess,
} from "./kernel";
import { bindHealth } from "./health";
import { LIGHT_PATHS, lightRoutes } from "./light";
import { POKEDEX_PATHS, pokedexRoutes } from "./pokedex";
import { achievementsRoutes } from "./achievements";
import { discoverRoutes } from "./discover";
import { monitoringRoutes } from "./monitoring";
import { deletionRoutes, exportRoutes, operatorDeletionRoutes } from "./privacy";
import { aiAccessRoutes } from "./ai";
import type { AppOptions } from "./app-options";
import {
  bindCareOne,
  bindEquipment,
  bindToday,
  bindWishlist,
  careOptions,
  careSources,
  aiPorts,
  todaySources,
} from "./app-bindings";
import { targetLocationFor } from "./care";

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
  app.route(
    "/",
    registrationRoutes(pool, verifier, opt.redeemLimit ? redeemGate(opt.redeemLimit) : undefined),
  );
  // `/account/*` also matches `/account` itself: one registration guards both (NFR-12).
  app.use("/account/*", auth);
  app.route("/account", accountRoutes(pool, opt.access));
  app.route("/account", exportRoutes(pool, opt.media?.store));
  app.route("/account", deletionRoutes(pool, opt.clock));
  for (const path of OPERATOR_PATHS) app.use(`${path}/*`, auth);
  app.route("/", operatorRoutes(pool, opt.clock));
  app.route("/", operatorDeletionRoutes(pool, opt.clock));
  return auth;
}

/** The protected routes of all modules behind the sign-in guard. */
function bindApi(app: Hono, opt: AppOptions, reviewer: TokenVerifier, pool: Pool) {
  const features = featureAccess(pool, opt.features ?? ALL_FEATURES);
  // Every answer of the account may be asked again with its ETag (NFR-12, issue 1244); registered first, so it wraps all
  // protected routes and not the public health routes, which answer before it.
  app.use("*", accountEtag());
  const auth = bindAccount(app, reviewer, pool, { ...opt, access: features });
  for (const path of LIGHT_PATHS) app.use(`${path}/*`, auth);
  app.route(
    "/",
    lightRoutes(
      pool,
      [
        careProfileZoneUsageFor(pool),
        specimenZoneUsageFor(pool),
        wishZoneUsageFor(pool),
        equipmentZoneUsageFor(pool),
      ],
      [equipmentLocationUsageFor(pool)],
    ),
  );
  for (const path of SPECIES_PATHS) app.use(`${path}/*`, auth);
  app.route("/", speciesRoutes(pool));
  for (const path of REVIEW_PATHS) app.use(`${path}/*`, auth);
  app.route("/", reviewRoutes(pool, COLLECTION_REPOINTERS));
  for (const path of GAP_PATHS) app.use(path, auth);
  app.route("/", gapRoutes(pool));
  for (const path of CORRECTION_PATHS) app.use(`${path}/*`, auth);
  app.route("/", correctionRoutes(pool));
  for (const path of SPECIMEN_PATHS) app.use(`${path}/*`, auth);
  app.route("/", specimenRoutes(pool, { clock: opt.clock, ...careSources(pool, opt) }));
  for (const path of POKEDEX_PATHS) app.use(`${path}/*`, auth);
  app.route("/", pokedexRoutes(pool));
  app.route("/", discoverRoutes(pool, auth, opt.zoneStock));
  app.route("/", achievementsRoutes(pool, auth, opt.clock));
  app.route("/", unlockRoutes(pool, auth, features, opt));
  app.route("/", monitoringRoutes(pool, auth, opt.clock));
  for (const path of CARE_PROFILE_PATHS) app.use(`${path}/*`, auth);
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
  const ai = opt.ai && { version: opt.version, ...opt.ai, features };
  app.route("/", aiAccessRoutes(pool, auth, ai, aiPorts(pool, opt, today, features)));
}

/**
 * Failures that no route answered (NFR-12, FR-QG-11, P-10). A database that did not answer in time, or cannot be reached,
 * gets the stable code `system.database_unavailable` (503); any other failure is a server error with the code
 * `system.unexpected`. The cause is logged with the running version (US-DEV-06), never sent.
 */
function failureAnswer(error: Error | HTTPException, c: Context) {
  if (error instanceof HTTPException) return error.getResponse();
  const unavailable = isDatabaseUnavailable(error);
  if (unavailable) console.error("Database unavailable", error.message);
  else console.error(`Request failed (version ${runningVersion()})`, error);
  const failure = appError(unavailable ? "system.database_unavailable" : "system.unexpected");
  return c.json(errorBody(failure), statusFor(failure));
}

export function createApp(opt: AppOptions = {}): Hono {
  const { version = "unknown", commit = "unknown" } = opt;
  const app = new Hono();
  app.onError((error, c) => failureAnswer(error, c));
  if (opt.webOrigin)
    app.use(
      "*",
      cors({
        origin: opt.webOrigin,
        allowHeaders: ["Authorization", "Content-Type", "Idempotency-Key"],
        exposeHeaders: ["Content-Disposition", "X-Missing-Photos"],
      }),
    );
  if (opt.writeLimit) app.use("*", writeLimit(opt.writeLimit));
  bindHealth(app, { pool: opt.pool, version, commit, storage: opt.media !== undefined });
  if (opt.reviewer && opt.pool) bindApi(app, opt, opt.reviewer, opt.pool);
  return app;
}
