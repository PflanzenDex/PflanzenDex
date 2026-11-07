import {
  EQUIPMENT_KEEPER_SWITCH,
  REPOT_PLANNER_KEEPER_SWITCH,
  appError,
  carePhasesOf,
  equipmentPlacePot,
  isActive,
  isTimeZone,
  keeperOffOf,
  localToday,
  repotPlan,
} from "@pflanzendex/core";
import {
  CareProfilePostgres,
  IdempotencyPostgres,
  KeeperSwitchPostgres,
  PotPlacementPostgres,
  RepotPostgres,
  SpeciesPostgres,
  SpecimenPostgres,
} from "@pflanzendex/db";
import { Hono, type Context } from "hono";
import type { Pool } from "pg";
import { body, errorBody, keyMissing, statusFor, write, type AuthEnv } from "../../kernel";

/** The status of a plant that is potted and repotted (US-BES-04); a name, compared as a value. */
const PLANT_STATUS = "plant" as const;

/** A plan needs the keeper's day, so a missing or unknown time zone is `input.invalid` on `timeZone` (NFR-08). */
function invalidTimeZone(c: Context<AuthEnv>) {
  const failure = appError("input.invalid", {
    details: [{ field: "timeZone", code: "input.invalid" }],
  });
  return c.json(errorBody(failure), statusFor(failure));
}

/** Whether the keeper switched a switch off (P-12); the keeper's switches are read once per call. */
const switchOffOf = async (switches: KeeperSwitchPostgres, userId: string, switchId: string) =>
  keeperOffOf(await switches.list(userId)).has(switchId);

/**
 * The repot plan of a plant (US-BES-19, FR-BES-27): `GET /specimens/:id/repot-plan?timeZone=` derives the hints, the free
 * pots and the season advice on every request (P-01), from the repot history, the observations, the care phase and the
 * placements. While the keeper switch "repot_planner" is off the answer hides the hints, the observations and the pots
 * (`hidden: true`); while the switch "equipment" is off the free pots are hidden (the pots stay, P-12). A foreign or unknown
 * plant is 404 (P-04). `POST /specimens/:id/pot` places the plant into one of the keeper's pots, or takes it out with
 * `potId` null (P-03, `Idempotency-Key`).
 */
export function repotPlanRoutes(pool: Pool, clock: () => Date): Hono<AuthEnv> {
  const specimens = new SpecimenPostgres(pool);
  const repots = new RepotPostgres(pool);
  const pots = new PotPlacementPostgres(pool);
  const switches = new KeeperSwitchPostgres(pool);
  const phaseDeps = {
    specimens,
    species: new SpeciesPostgres(pool),
    profiles: new CareProfilePostgres(pool),
    clock,
  };
  const place = equipmentPlacePot({
    specimens,
    pots,
    clock,
    keeperOff: (userId) => switchOffOf(switches, userId, EQUIPMENT_KEEPER_SWITCH),
  });
  const writes = { idempotency: new IdempotencyPostgres(pool) };
  const routes = new Hono<AuthEnv>();

  routes.get("/specimens/:id/repot-plan", async (c) => {
    const userId = c.get("account").id;
    const id = c.req.param("id");
    const timeZone = c.req.query("timeZone");
    if (!isTimeZone(timeZone)) return invalidTimeZone(c);
    const specimen = await specimens.find(userId, id);
    if (!specimen) return c.json(errorBody(appError("specimen.not_found")), 404);
    // One read of the keeper's switches answers both flags (the query-count gate measures one read per request).
    const off = keeperOffOf(await switches.list(userId));
    const hidden = off.has(REPOT_PLANNER_KEEPER_SWITCH);
    const equipmentOff = off.has(EQUIPMENT_KEEPER_SWITCH);
    const [last, open, phases, current, free] = await Promise.all([
      repots.lastRepotted(userId, [id]),
      repots.openSigns(userId, id),
      carePhasesOf(phaseDeps, userId, [id], timeZone),
      pots.currentPot(userId, id),
      pots.freePots(userId),
    ]);
    const plan = repotPlan({
      today: localToday(clock(), timeZone),
      // A cutting is potted out and an archived plant is read only: neither gets a hint (US-BES-04, US-BES-07).
      cutting: specimen.status !== PLANT_STATUS || !isActive(specimen),
      lastRepot: last.get(id) ?? null,
      openSigns: hidden || typeof open === "string" ? [] : open,
      phase: phases.get(id) ?? null,
      currentPot: hidden ? null : current,
      freePots: hidden || equipmentOff ? [] : free,
      citedInterval: null,
    });
    return c.json({ specimenId: id, status: specimen.status, hidden, equipmentOff, ...plan });
  });

  routes.post("/specimens/:id/pot", async (c) => {
    if (!c.req.header("idempotency-key")) return keyMissing(c);
    return write(c, writes, place, {
      input: { ...(await body(c)), specimenId: c.req.param("id") },
    });
  });
  return routes;
}
