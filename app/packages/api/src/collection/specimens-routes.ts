import {
  NO_TREATMENTS,
  NO_MEASUREMENTS,
  NO_TARGET_LOCATION,
  specimenCreate,
  specimenRepot,
  specimenCards,
  specimenLoad,
  specimenList,
  appError,
  localToday,
  isTimeZone,
  type TreatmentSource,
  type MeasurementSource,
  type TargetLocationSource,
} from "@pflanzendex/core";
import {
  SpeciesPostgres,
  SpecimenPostgres,
  IdempotencyPostgres,
  LocationPostgres,
  ZonePostgres,
} from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import { errorBody, body, write, type AuthEnv } from "../kernel";
import { archivedRoutes } from "./archived-routes";
import { markerRoutes } from "./marker-routes";
import { derivedRoutes } from "./derived-routes";

/** Paths the sign-in guard (bearer token) must cover. */
export const SPECIMEN_PATHS = ["/specimens"] as const;

export type SpecimenOptions = {
  /** Target location per species and day; implemented by `care` (PHA), until then nobody knows one (P-08). */
  targetLocation?: TargetLocationSource | undefined;
  /** The clock for "today" (NFR-08); tests pin it. */
  clock?: (() => Date) | undefined;
  /** Last measurement and most recent photo per specimen; implemented by `care` (WAC), until then there are none (US-BES-06). */
  measurements?: MeasurementSource | undefined;
  /** Open treatments per specimen; implemented by `care` (BEH), until then there are none (US-BES-06). */
  treatments?: TreatmentSource | undefined;
};

/**
 * Specimens (US-BES-02, US-BES-04, US-BES-07). Writing goes only through `specimen.create`, `.repot`, `.archive` and `.restore` (P-03, with
 * `Idempotency-Key`); lists and cards show no archived specimens, `/specimens/archived` does. Reading returns only
 * specimens of the own account, a foreign or unknown specimen looks the same: 404 (P-04).
 */
export function specimenRoutes(pool: Pool, opt: SpecimenOptions = {}): Hono<AuthEnv> {
  const specimens = new SpecimenPostgres(pool);
  const deps = { idempotency: new IdempotencyPostgres(pool) };
  const clock = opt.clock ?? (() => new Date());
  const create = specimenCreate({
    specimens,
    species: new SpeciesPostgres(pool),
    targetLocation: opt.targetLocation ?? NO_TARGET_LOCATION,
    clock,
  });
  const repot = specimenRepot({ specimens });
  const cardsDeps = {
    specimens,
    species: new SpeciesPostgres(pool),
    locations: new LocationPostgres(pool),
    zones: new ZonePostgres(pool),
    measurements: opt.measurements ?? NO_MEASUREMENTS,
    treatments: opt.treatments ?? NO_TREATMENTS,
  };
  const routes = new Hono<AuthEnv>();

  routes.get("/specimens", async (c) =>
    c.json({ specimens: await specimenList(specimens, c.get("account").id) }),
  );
  // Before `/specimens/:id`, otherwise "cards" would be read as an ID. "Today" is the local date of the device's time zone (NFR-08).
  routes.get("/specimens/cards", async (c) => {
    const timeZone = c.req.query("timeZone");
    if (!isTimeZone(timeZone)) {
      const details = [{ field: "timeZone", code: "input.invalid" as const }];
      return c.json(errorBody(appError("input.invalid", { details })), 400);
    }
    const cards = await specimenCards(
      cardsDeps,
      c.get("account").id,
      localToday(clock(), timeZone),
    );
    return c.json({ cards });
  });
  // Archive, archive and restore (US-BES-07); before `/specimens/:id`.
  routes.route("/", archivedRoutes(pool, clock));
  // US-BES-03: give a specimen a marker or change it.
  routes.route("/", markerRoutes(pool));
  // Distribution (US-LIC-02) and hints (US-BES-08); before `/specimens/:id`.
  routes.route("/", derivedRoutes(pool));
  routes.get("/specimens/:id", async (c) => {
    const e = await specimenLoad(specimens, c.get("account").id, c.req.param("id"));
    return e ? c.json(e) : c.json(errorBody(appError("specimen.not_found")), 404);
  });
  routes.post("/specimens", async (c) =>
    write(c, deps, create, { input: await body(c), success: 201 }),
  );
  // US-BES-04: a cutting becomes a plant; only the status changes (P-03, with `Idempotency-Key`).
  routes.post("/specimens/:id/repot", async (c) =>
    write(c, deps, repot, { input: { specimenId: c.req.param("id") } }),
  );
  return routes;
}
