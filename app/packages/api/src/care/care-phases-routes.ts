import {
  careProfileLocations,
  carePhasesList,
  phaseSwitchConfirm,
  type PhaseLocationSource,
} from "@pflanzendex/core";
import {
  CareProfilePostgres,
  IdempotencyPostgres,
  SpeciesPostgres,
  SpecimenPostgres,
} from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import { body, errorBody, statusFor, write, type AuthEnv } from "../kernel";

/** Paths the sign-in guard (bearer token) must cover. */
export const CARE_PHASES_PATHS = ["/care-phases"] as const;

export type CarePhasesOptions = {
  /** The clock for "today" (NFR-08); tests pin it. */
  clock?: () => Date;
  /** Replaces the care profile as source of the location per phase (tests); by default it is the keeper's own care profile (US-BES-09). */
  phaseLocation?: PhaseLocationSource | undefined;
};

/**
 * Care phases: the list (US-PHA-01) is read only, the phase is derived from the calendar on every request, never
 * stored (P-01). `timeZone` (IANA name, the profile's, US-ACC-02, device zone as fallback) determines
 * "today". "Moved now" (US-PHA-03) writes only through `care.confirm_switch` (P-03, with `Idempotency-Key`); the
 * target location is derived on the server, never taken from the request (FR-PHA-03).
 */
export function carePhasesRoutes(pool: Pool, opt: CarePhasesOptions = {}): Hono<AuthEnv> {
  const profiles = new CareProfilePostgres(pool);
  const deps = {
    specimens: new SpecimenPostgres(pool),
    species: new SpeciesPostgres(pool),
    profiles,
    targets: opt.phaseLocation ?? careProfileLocations(profiles),
    clock: opt.clock ?? (() => new Date()),
  };
  const confirm = phaseSwitchConfirm(deps);
  const idempotency = { idempotency: new IdempotencyPostgres(pool) };
  const routes = new Hono<AuthEnv>();
  routes.get("/care-phases", async (c) => {
    const r = await carePhasesList(deps, c.get("account").id, c.req.query("timeZone"));
    return r.ok ? c.json({ phases: r.value }) : c.json(errorBody(r.error), statusFor(r.error));
  });
  routes.post("/care-phases/confirm", async (c) =>
    write(c, idempotency, confirm, { input: await body(c) }),
  );
  return routes;
}
