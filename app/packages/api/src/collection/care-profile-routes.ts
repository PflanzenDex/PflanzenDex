import { careProfileUpdate, careProfileView, careProfileZoneUsage } from "@pflanzendex/core";
import type { ZoneUsage } from "@pflanzendex/core";
import {
  CareProfilePostgres,
  IdempotencyPostgres,
  SpeciesPostgres,
  SpecimenPostgres,
  ZonePostgres,
} from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import { body, write, type AuthEnv } from "../kernel";

/** Paths the sign-in guard (bearer token) must cover. */
export const CARE_PROFILE_PATHS = ["/care-profiles"] as const;

/** The zone usage of the care profiles for `lightRoutes`: a zone in use is not deleted unnoticed (US-LIC-05). */
export function careProfileZoneUsageFor(pool: Pool): ZoneUsage {
  return careProfileZoneUsage({
    profiles: new CareProfilePostgres(pool),
    species: new SpeciesPostgres(pool),
  });
}

/**
 * My own care profile per species (US-BES-09, DM-BES-04). Reading is a derived view (catalog value and my deviation
 * side by side, nothing stored twice, P-01); writing goes only through `care_profile.update` (P-03, with
 * `Idempotency-Key`). Everything is private to the account (P-04, P-05): a foreign species, location or zone looks
 * like an unknown one (404). The catalog is never written.
 */
export function careProfileRoutes(pool: Pool): Hono<AuthEnv> {
  const profiles = new CareProfilePostgres(pool);
  const species = new SpeciesPostgres(pool);
  const update = careProfileUpdate({ profiles, species });
  const view = {
    specimens: new SpecimenPostgres(pool),
    species,
    profiles,
    zones: new ZonePostgres(pool),
  };
  const deps = { idempotency: new IdempotencyPostgres(pool) };
  const routes = new Hono<AuthEnv>();
  routes.get("/care-profiles", async (c) =>
    c.json({ entries: await careProfileView(view, c.get("account").id) }),
  );
  routes.put("/care-profiles/:speciesId", async (c) =>
    write(c, deps, update, { input: { ...(await body(c)), speciesId: c.req.param("speciesId") } }),
  );
  return routes;
}
