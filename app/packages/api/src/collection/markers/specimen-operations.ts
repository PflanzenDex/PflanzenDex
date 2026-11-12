import {
  EQUIPMENT_KEEPER_SWITCH,
  NO_TARGET_LOCATION,
  keeperOffOf,
  specimenCorrectCatchDate,
  specimenCreate,
  specimenMark,
  specimenRepotWithPot,
  specimenRestore,
  specimenSetLightZone,
  specimenSetLocation,
  type TargetLocationSource,
} from "@pflanzendex/core";
import {
  KeeperSwitchPostgres,
  PotRepotPostgres,
  SpeciesPostgres,
  SpecimenPostgres,
} from "@pflanzendex/db";
import type { Pool } from "pg";

export interface SpecimenOperationOptions {
  readonly targetLocation?: TargetLocationSource | undefined;
  readonly clock?: (() => Date) | undefined;
}

/**
 * The write operations of a specimen, built once (KI-R10): the app's routes and the AI client's write tools run these
 * same operations, so both share the checks, the error codes and the idempotency (FR-KI-14). The repot with its pot is
 * one unit of work (`PotRepotPostgres`); with the equipment switch off a pot is refused (P-12).
 */
export function specimenOperations(pool: Pool, opt: SpecimenOperationOptions = {}) {
  const specimens = new SpecimenPostgres(pool);
  const species = new SpeciesPostgres(pool);
  const clock = opt.clock ?? (() => new Date());
  const switches = new KeeperSwitchPostgres(pool);
  return {
    create: specimenCreate({
      specimens,
      species,
      targetLocation: opt.targetLocation ?? NO_TARGET_LOCATION,
      clock,
    }),
    mark: specimenMark({ specimens, species }),
    correctCatchDate: specimenCorrectCatchDate({ specimens, clock }),
    setLocation: specimenSetLocation({ specimens }),
    setLightZone: specimenSetLightZone({ specimens }),
    repot: specimenRepotWithPot({
      unit: new PotRepotPostgres(pool),
      clock,
      keeperOff: async (userId) =>
        keeperOffOf(await switches.list(userId)).has(EQUIPMENT_KEEPER_SWITCH),
    }),
    restore: specimenRestore({ specimens }),
  };
}

export type SpecimenOperations = ReturnType<typeof specimenOperations>;
