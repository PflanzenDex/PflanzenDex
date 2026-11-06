import { carePhasesOf, type OfferDependencies } from "@pflanzendex/core";
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
 * do not know each other, only the app root does. The phase of a specimen is read from the care phase list itself, so the
 * offer and the phase list can never disagree; the reads take any number of specimens in one step (NFR-12).
 */
export function offerDependencies(pool: Pool, opt: { clock?: () => Date } = {}): OfferDependencies {
  const specimens = new SpecimenPostgres(pool);
  const phaseDeps = {
    specimens,
    species: new SpeciesPostgres(pool),
    profiles: new CareProfilePostgres(pool),
    clock: opt.clock ?? (() => new Date()),
  };
  const treatments = new TreatmentsPostgres(pool);
  return {
    offers: new OffersPostgres(pool),
    specimens: {
      find: async (userId, id) => specimens.find(userId, id),
      findMany: async (userId, ids) => specimens.findMany(userId, ids),
    },
    sharing: new SharingPostgres(pool),
    treatments: {
      openAndLastDone: (u, ids) => treatments.openAndLastDone(u, ids),
    },
    phases: {
      // A caller that shares its owner's species read of the request passes it on (NFR-12); the rest reads them here.
      phasesOf: (userId, ids, timeZone, species) =>
        carePhasesOf(
          { ...phaseDeps, species: species ?? phaseDeps.species },
          userId,
          ids,
          timeZone,
        ),
    },
  };
}
