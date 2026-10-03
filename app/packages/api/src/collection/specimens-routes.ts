import {
  NO_TARGET_LOCATION,
  specimenCreate,
  specimenLoad,
  specimenList,
  appError,
  type TargetLocationSource,
} from "@pflanzendex/core";
import { SpeciesPostgres, SpecimenPostgres, IdempotencyPostgres } from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import { errorBody, body, write, type AuthEnv } from "../kernel";

/** Paths the sign-in guard (bearer token) must cover. */
export const SPECIMEN_PATHS = ["/specimens"] as const;

export type SpecimenOptions = {
  /** Target location per species and day; implemented by `care` (PHA), until then nobody knows one (P-08). */
  targetLocation?: TargetLocationSource;
  /** The clock for "today" (NFR-08); tests pin it. */
  clock?: () => Date;
};

/**
 * Specimens (US-BES-02). Writing goes only through `specimen.create` (P-03, with `Idempotency-Key`); reading returns only
 * specimens of the own account, a foreign or unknown specimen looks the same: 404 (P-04).
 */
export function specimenRoutes(pool: Pool, opt: SpecimenOptions = {}): Hono<AuthEnv> {
  const specimens = new SpecimenPostgres(pool);
  const deps = { idempotency: new IdempotencyPostgres(pool) };
  const create = specimenCreate({
    specimens,
    species: new SpeciesPostgres(pool),
    targetLocation: opt.targetLocation ?? NO_TARGET_LOCATION,
    clock: opt.clock ?? (() => new Date()),
  });
  const routes = new Hono<AuthEnv>();

  routes.get("/specimens", async (c) =>
    c.json({ specimens: await specimenList(specimens, c.get("account").id) }),
  );
  routes.get("/specimens/:id", async (c) => {
    const e = await specimenLoad(specimens, c.get("account").id, c.req.param("id"));
    return e ? c.json(e) : c.json(errorBody(appError("specimen.not_found")), 404);
  });
  routes.post("/specimens", async (c) =>
    write(c, deps, create, { input: await body(c), success: 201 }),
  );
  return routes;
}
