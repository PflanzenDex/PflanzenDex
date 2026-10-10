import {
  careProfileLocations,
  todayStatus,
  type MeasurementSource,
  type PhaseLocationSource,
  type ZoneStockSource,
} from "@pflanzendex/core";
import {
  CareProfilePostgres,
  LocationPostgres,
  SpeciesPostgres,
  SpecimenPostgres,
  TreatmentsPostgres,
  WishesPostgres,
} from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import { errorBody, statusFor, type AuthEnv } from "../kernel";
import { wateringRoutes } from "./watering-routes";

/** Paths the sign-in guard (bearer token) must cover. */
export const TODAY_PATHS = ["/today", "/watering"] as const;

export type TodayOptions = {
  /** The clock for "today" (NFR-08); tests pin it. */
  clock?: () => Date;
  /** Replaces the care profile as source of the location per phase (tests). */
  phaseLocation?: PhaseLocationSource | undefined;
  /** Last measurement per specimen (US-QS-04); the app root wires `care`. */
  measurements: MeasurementSource;
  /** Stock per zone 2 to 4 for the buffer warning (US-WUN-02); the app root wires the distribution. */
  zoneStock: ZoneStockSource;
};

/** The dependencies of the central status function; the reminders (US-MON-01) derive their occasions from the same ones (FR-MON-03). */
export function todayDependencies(pool: Pool, opt: TodayOptions) {
  const profiles = new CareProfilePostgres(pool);
  return {
    specimens: new SpecimenPostgres(pool),
    species: new SpeciesPostgres(pool),
    locations: new LocationPostgres(pool),
    treatments: new TreatmentsPostgres(pool),
    profiles,
    targets: opt.phaseLocation ?? careProfileLocations(profiles),
    clock: opt.clock ?? (() => new Date()),
    measurements: opt.measurements,
    wishes: new WishesPostgres(pool),
    stock: opt.zoneStock,
  };
}

/**
 * The central "Today" list (TE-07): read only, derived on every request from the keeper's own data (P-01, P-04), through
 * the one `status` function of `core` that reminders and the AI status use as well (R-04). `timeZone` (IANA name)
 * decides what "today" is (NFR-08).
 */
export function todayRoutes(pool: Pool, opt: TodayOptions): Hono<AuthEnv> {
  const deps = todayDependencies(pool, opt);
  const routes = new Hono<AuthEnv>();
  routes.get("/today", async (c) => {
    const r = await todayStatus(deps, c.get("account").id, c.req.query("timeZone"));
    return r.ok ? c.json(r.value) : c.json(errorBody(r.error), statusFor(r.error));
  });
  routes.route("/", wateringRoutes(pool, opt.clock ?? (() => new Date())));
  return routes;
}
