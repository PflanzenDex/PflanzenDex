import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Pool } from "pg";
import { productTitle, type TargetLocationSource } from "@pflanzendex/core";
import { authentication, accountRoutes, type TokenVerifier } from "./account";
import { SPECIMEN_PATHS, specimenRoutes } from "./collection";
import { SPECIES_PATHS, speciesRoutes } from "./catalog";
import { LIGHT_PATHS, lightRoutes } from "./light";

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
};

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
        ...(opt.clock ? { clock: opt.clock } : {}),
        ...(opt.targetLocation ? { targetLocation: opt.targetLocation } : {}),
      }),
    );
  }
  return app;
}
