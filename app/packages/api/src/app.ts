import { Hono, type MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import type { Pool } from "pg";
import {
  productTitle,
  type TreatmentSource,
  type MeasurementSource,
  type TargetLocationSource,
  type PhaseLocationSource,
} from "@pflanzendex/core";
import { authentication, accountRoutes, type TokenVerifier } from "./account";
import { SPECIMEN_PATHS, specimenRoutes } from "./collection";
import { SPECIES_PATHS, speciesRoutes } from "./catalog";
import { LIGHT_PATHS, lightRoutes } from "./light";
import {
  CARE_PATHS,
  CARE_PHASES_PATHS,
  careRoutes,
  carePhasesRoutes,
  measurementSourceFor,
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
  /** Target location for new specimens; `care` (PHA) supplies it, until then the location is unknown. */
  targetLocation?: TargetLocationSource;
  /** Measurements and treatments for the specimen cards (US-BES-06); without it `care` supplies the measurements (WAC-01), the treatments are still missing (BEH). */
  measurements?: MeasurementSource;
  treatments?: TreatmentSource;
  /** Location per phase of the keeper (care profile, US-BES-09); without it nobody knows one and a move cannot be confirmed (US-PHA-03). */
  phaseLocation?: PhaseLocationSource;
};

/** The module `care` (measurements and care phases): sign-in guard in front of the paths, then the routes. */
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
    app.route("/", lightRoutes(opt.pool));
    for (const path of SPECIES_PATHS) app.use(path, auth).use(`${path}/*`, auth);
    app.route("/", speciesRoutes(opt.pool));
    for (const path of SPECIMEN_PATHS) app.use(path, auth).use(`${path}/*`, auth);
    app.route(
      "/",
      specimenRoutes(opt.pool, {
        clock: opt.clock,
        targetLocation: opt.targetLocation,
        measurements: opt.measurements ?? measurementSourceFor(opt.pool),
        treatments: opt.treatments,
      }),
    );
    bindCareOne(app, opt.pool, auth, {
      ...(opt.clock ? { clock: opt.clock } : {}),
      ...(opt.phaseLocation ? { phaseLocation: opt.phaseLocation } : {}),
    });
  }
  return app;
}
