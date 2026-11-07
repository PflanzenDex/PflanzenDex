import {
  NO_TREATMENTS,
  NO_MEASUREMENTS,
  NO_MEASURED,
  NO_PROVENANCE,
  NO_TARGET_LOCATION,
  specimenCreate,
  specimenCorrectCatchDate,
  specimenRepotWithPot,
  EQUIPMENT_KEEPER_SWITCH,
  keeperOffOf,
  specimenLoad,
  specimenList,
  specimenNotes,
  specimenSetNotes,
  appError,
  type TreatmentSource,
  type MeasurementSource,
  type MeasuredSource,
  type ProvenanceSource,
  type TargetLocationSource,
} from "@pflanzendex/core";
import {
  CareProfilePostgres,
  KeeperSwitchPostgres,
  PotRepotPostgres,
  SpeciesPostgres,
  SpecimenPostgres,
  SpecimenNotesPostgres,
  IdempotencyPostgres,
  LocationPostgres,
  ZonePostgres,
  specimenAnyActive,
  specimenCounts,
  specimenPage,
  treatableSpecimens,
} from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import { errorBody, body, write, type AuthEnv } from "../../kernel";
import { archivedRoutes } from "../archived/archived-routes";
import { repotPlanRoutes } from "../repot/repot-plan-routes";
import { repotSignRoutes } from "../repot/repot-routes";
import { markerRoutes } from "../markers/marker-routes";
import { locationRoutes } from "../markers/location-routes";
import { derivedRoutes } from "../insights/derived-routes";
import { cardRoutes } from "../cards/cards-routes";
import { importRoutes } from "../bulk/import-routes";

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
  /** From whom received specimens came; implemented by `swap` (US-SOZ-13), until then the cards show none. */
  provenance?: ProvenanceSource | undefined;
  /** The measured plants (summary of the cards); implemented by `care` (WAC), until then none is measured. */
  measured?: MeasuredSource | undefined;
};

/** What the cards read (US-BES-06); the care profiles give the same effective zone as the distribution (#592). */
export const cardsDependencies = (
  pool: Pool,
  specimens: SpecimenPostgres,
  opt: SpecimenOptions,
) => ({
  specimens,
  species: new SpeciesPostgres(pool),
  locations: new LocationPostgres(pool),
  zones: new ZonePostgres(pool),
  measurements: opt.measurements ?? NO_MEASUREMENTS,
  treatments: opt.treatments ?? NO_TREATMENTS,
  provenance: opt.provenance ?? NO_PROVENANCE,
  profiles: new CareProfilePostgres(pool),
  measured: opt.measured ?? NO_MEASURED,
  // The page reads of the card list and the summary run in the database (NFR-12, FR-BES-23).
  pages: {
    page: (userId: string, q: Parameters<typeof specimenPage>[2]) => specimenPage(pool, userId, q),
    summary: (userId: string) => specimenCounts(pool, userId),
    anyActive: (userId: string, ids: readonly string[]) => specimenAnyActive(pool, userId, ids),
    treatable: (userId: string) => treatableSpecimens(pool, userId),
  },
});

/**
 * The repot with its pot (US-BES-04, US-BES-19): one unit of work, so the repot and the placement commit or roll back
 * together (`PotRepotPostgres`). With the equipment switch off a pot is refused (P-12).
 */
function specimenRepotWithPotOf(pool: Pool, clock: () => Date) {
  const switches = new KeeperSwitchPostgres(pool);
  return specimenRepotWithPot({
    unit: new PotRepotPostgres(pool),
    clock,
    keeperOff: async (userId) =>
      keeperOffOf(await switches.list(userId)).has(EQUIPMENT_KEEPER_SWITCH),
  });
}

/**
 * Specimens (US-BES-02, US-BES-04, US-BES-07, US-PHA-03). Writing goes only through `specimen.create`, `.correct_catch_date`, `.repot`, `.archive`, `.restore` and `.set_location` (P-03, with
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
  const repot = specimenRepotWithPotOf(pool, clock);
  const correct = specimenCorrectCatchDate({ specimens, clock });
  const notes = new SpecimenNotesPostgres(pool);
  const setNotes = specimenSetNotes({ specimens: notes });
  const cardsDeps = cardsDependencies(pool, specimens, opt);
  const routes = new Hono<AuthEnv>();

  routes.get("/specimens", async (c) =>
    c.json({ specimens: await specimenList(specimens, c.get("account").id) }),
  );
  // The card list, its summary, the treatment list and one card (US-BES-06, FR-BES-23); before `/specimens/:id`, otherwise
  // "cards" would be read as an ID.
  // US-BES-18: the CSV import of plants (literal paths `/specimens/import…`, so no ID route can take them); before `/specimens/:id`.
  routes.route("/", importRoutes(pool, { clock, targetLocation: opt.targetLocation }));
  routes.route("/", cardRoutes(cardsDeps, clock));
  // The start page only needs the numbers of active and archived specimens (US-ACC-03); before `/specimens/:id`.
  routes.get("/specimens/count", async (c) => {
    const n = await specimens.countByStatus(c.get("account").id);
    return c.json({ count: n.active, archived: n.archived });
  });
  // Archive, archive and restore (US-BES-07); before `/specimens/:id`.
  routes.route("/", archivedRoutes(pool, clock));
  // US-BES-19: tick or clear one repot observation of a plant (P-03, `Idempotency-Key`); before `/specimens/:id`.
  routes.route("/", repotSignRoutes(pool, clock));
  // US-BES-19: the repot plan (read) and the placement into a pot (P-03); before `/specimens/:id`.
  routes.route("/", repotPlanRoutes(pool, clock));
  // US-BES-03: give a specimen a marker or change it.
  routes.route("/", markerRoutes(pool));
  // US-PHA-03: set the location of a specimen (BES-08 "location missing").
  routes.route("/", locationRoutes(pool));
  // Distribution (US-LIC-02) and hints (US-BES-08); before `/specimens/:id`.
  routes.route("/", derivedRoutes(pool));
  // US-BES-18: the keeper's own detail carries the private notes; the other reads of a specimen (lists, cards, friends,
  // swaps, AI) leave them out (P-05).
  routes.get("/specimens/:id", async (c) => {
    const account = c.get("account").id;
    const e = await specimenLoad(specimens, account, c.req.param("id"));
    if (!e) return c.json(errorBody(appError("specimen.not_found")), 404);
    const own = await specimenNotes(notes, account, e.id);
    return c.json({ ...e, notes: own?.notes ?? null });
  });
  routes.post("/specimens", async (c) =>
    write(c, deps, create, { input: await body(c), success: 201 }),
  );
  // US-BES-04: a cutting becomes a plant; only the status changes (P-03, with `Idempotency-Key`).
  // The answer is the plant as before (`id`, `status`, `repottedAt`) and the pot it sits in now (`pot`, null if none).
  routes.post("/specimens/:id/repot", async (c) =>
    write(c, deps, repot, {
      input: { ...(await body(c)), specimenId: c.req.param("id") },
      wrapper: (v) => ({ ...v.specimen, pot: v.pot }),
    }),
  );
  // US-BES-11: correct the catch date; only `caught_at` changes, same rules as on creation (P-03, `Idempotency-Key`).
  routes.post("/specimens/:id/catch-date", async (c) =>
    write(c, deps, correct, { input: { ...(await body(c)), specimenId: c.req.param("id") } }),
  );
  // US-BES-18: set or clear the private notes (P-03, `Idempotency-Key`); an empty text clears them.
  routes.post("/specimens/:id/notes", async (c) =>
    write(c, deps, setNotes, { input: { ...(await body(c)), specimenId: c.req.param("id") } }),
  );
  return routes;
}
