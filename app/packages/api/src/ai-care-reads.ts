import {
  careProfileLocations,
  carePhasesList,
  ok,
  pokedexOwnership,
  reminderInbox,
  treatmentHistory,
  treatmentOpenList,
  wishBought,
  wishCandidates,
  wishDiscarded,
  appError,
  failed,
  type AreaReadSource,
  type PhaseLocationSource,
  type Result,
  type ZoneStockSource,
} from "@pflanzendex/core";
import {
  CareProfilePostgres,
  RemindersPostgres,
  SpeciesPostgres,
  SpecimenPostgres,
  TreatmentsPostgres,
  WishesPostgres,
} from "@pflanzendex/db";
import type { Pool } from "pg";
import { achievementReadsFor } from "./achievements";
import { collectorCardsFor } from "./pokedex";
import { wateringDueFor } from "./today";

export interface AreaReadOptions {
  readonly clock: () => Date;
  readonly zoneStock: ZoneStockSource;
  readonly phaseLocation?: PhaseLocationSource | undefined;
}

type CareAreas =
  | "list_care_phases"
  | "list_open_treatments"
  | "list_treatment_history"
  | "list_watering_due"
  | "list_reminders"
  | "get_reminder_settings"
  | "list_wish_candidates"
  | "list_bought_wishes"
  | "list_discarded_wishes"
  | "get_pokedex_ownership"
  | "list_pokedex_cards"
  | "get_achievements"
  | "get_growth_records";

const wrap = async <T>(key: string, r: Promise<Result<T>>): Promise<Result<object>> => {
  const v = await r;
  return v.ok ? ok({ [key]: v.value }) : v;
};
const zone = (tz: string | null) => tz ?? "UTC";

/**
 * Care, wishlist, Pokédex and achievements for the AI client (US-KI-12, KI-R10): every area calls the function of the
 * app's own route with the same adapters (FR-KI-14): `GET /care-phases`, `/treatments`, `/treatments/history`,
 * `/watering/due`, `/reminders`, `/reminders/settings`, `/wishes/candidates|bought|discarded`, `/pokedex/ownership`,
 * `/pokedex/cards`, `/achievements` and `/achievements/growth/:id`. Everything runs under the account (P-04).
 */
export function careAreaReadsFor(
  pool: Pool,
  opt: AreaReadOptions,
): Pick<AreaReadSource, CareAreas> {
  const specimens = new SpecimenPostgres(pool);
  const species = new SpeciesPostgres(pool);
  const profiles = new CareProfilePostgres(pool);
  const treatments = new TreatmentsPostgres(pool);
  const reminders = new RemindersPostgres(pool);
  const wishes = new WishesPostgres(pool);
  const { clock } = opt;
  const phases = {
    specimens,
    species,
    profiles,
    targets: opt.phaseLocation ?? careProfileLocations(profiles),
    clock,
  };
  const cards = collectorCardsFor(pool);
  const achievements = achievementReadsFor(pool, clock);
  const growth = async (userId: string, id: string | null) => {
    const r = await achievements.growth(userId, id ?? "");
    return r ? ok(r) : failed(appError("specimen.not_found"));
  };
  return {
    list_care_phases: (u, q) => wrap("phases", carePhasesList(phases, u, q.timeZone)),
    list_open_treatments: (u, q) =>
      wrap("treatments", treatmentOpenList({ specimens, treatments, clock }, u, q.timeZone)),
    list_treatment_history: (u, q) =>
      wrap("treatments", treatmentHistory({ specimens, treatments }, u, q.specimenId)),
    list_watering_due: async (u, q) =>
      ok({ due: await wateringDueFor(pool, u, zone(q.timeZone), clock()) }),
    list_reminders: async (u) => ok({ reminders: await reminderInbox({ reminders }, u) }),
    get_reminder_settings: async (u) => ok(await reminders.settings(u)),
    list_wish_candidates: async (u) =>
      ok(await wishCandidates({ wishes, stock: opt.zoneStock }, u)),
    list_bought_wishes: async (u) => ok(await wishBought({ wishes }, u)),
    list_discarded_wishes: async (u) => ok(await wishDiscarded({ wishes }, u)),
    get_pokedex_ownership: async (u, q) =>
      ok(await pokedexOwnership({ specimens, species }, u, zone(q.timeZone))),
    list_pokedex_cards: async (u, q) => ok(await cards(u, zone(q.timeZone))),
    get_achievements: async (u, q) => ok(await achievements.overview(u, zone(q.timeZone))),
    get_growth_records: (u, q) => growth(u, q.specimenId),
  };
}
