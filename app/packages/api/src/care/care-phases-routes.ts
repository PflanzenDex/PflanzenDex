import { NO_PHASE_LOCATION, carePhasesList, type PhaseLocationSource } from "@pflanzendex/core";
import { SpeciesPostgres, SpecimenPostgres } from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import { errorBody, statusFor, type AuthEnv } from "../kernel";

/** Paths the sign-in guard (bearer token) must cover. */
export const CARE_PHASES_PATHS = ["/care-phases"] as const;

export type CarePhasesOptions = {
  /** The clock for "today" (NFR-08); tests pin it. */
  clock?: () => Date;
  /** Location per phase of the keeper (care profile, US-BES-09); until it exists nobody knows one (P-08). */
  phaseLocation?: PhaseLocationSource | undefined;
};

/**
 * Care phases (US-PHA-01), read only: the phase is derived from the calendar on every request, never stored (P-01).
 * `timeZone` (IANA name, from the device for now, until the profile has one, US-ACC-02) determines "today".
 */
export function carePhasesRoutes(pool: Pool, opt: CarePhasesOptions = {}): Hono<AuthEnv> {
  const deps = {
    specimens: new SpecimenPostgres(pool),
    species: new SpeciesPostgres(pool),
    targets: opt.phaseLocation ?? NO_PHASE_LOCATION,
    clock: opt.clock ?? (() => new Date()),
  };
  const routes = new Hono<AuthEnv>();
  routes.get("/care-phases", async (c) => {
    const r = await carePhasesList(deps, c.get("account").id, c.req.query("timeZone"));
    return r.ok ? c.json({ phases: r.value }) : c.json(errorBody(r.error), statusFor(r.error));
  });
  return routes;
}
