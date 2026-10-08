import {
  careProfileLocations,
  carePhasesList,
  type OfferDependencies,
  type PhaseLocationSource,
} from "@pflanzendex/core";
import {
  CareProfilePostgres,
  OffersPostgres,
  SharingPostgres,
  SpeciesPostgres,
  SpecimenPostgres,
  TreatmentsPostgres,
} from "@pflanzendex/db";
import type { Pool } from "pg";

/**
 * Wiring in the app root (ADR 0012): `swap` defines the ports, `collection`, `care` and `social` answer them; the modules
 * do not know each other, only the app root does. The phase of a specimen is the one of the care phase list, so the offer
 * and the phase list can never disagree.
 */
export function offerDependencies(
  pool: Pool,
  opt: { clock?: () => Date; phaseLocation?: PhaseLocationSource | undefined } = {},
): OfferDependencies {
  const specimens = new SpecimenPostgres(pool);
  const profiles = new CareProfilePostgres(pool);
  const phaseDeps = {
    specimens,
    species: new SpeciesPostgres(pool),
    targets: opt.phaseLocation ?? careProfileLocations(profiles),
    profiles,
    clock: opt.clock ?? (() => new Date()),
  };
  const treatments = new TreatmentsPostgres(pool);
  return {
    offers: new OffersPostgres(pool),
    specimens: { find: async (userId, id) => specimens.find(userId, id) },
    sharing: new SharingPostgres(pool),
    treatments: {
      open: (u, ids) => treatments.open(u, ids),
      done: (u, id) => treatments.done(u, id),
    },
    phases: {
      async phaseOf(userId, specimenId, timeZone) {
        const rows = await carePhasesList(phaseDeps, userId, timeZone);
        return rows.ok
          ? (rows.value.find((p) => p.specimenId === specimenId)?.phase ?? null)
          : null;
      },
    },
  };
}
