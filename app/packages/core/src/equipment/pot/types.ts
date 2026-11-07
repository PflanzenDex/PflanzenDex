// The pot a plant sits in (US-BES-19, DM-EQU-06): placements of plants into own pots. Ports for persistence; the adapter
// lives in `db` (AB-1). A placement is written by the pot operations only; the repot itself is `specimen.repot`.
import type { SpecimenStore } from "../../collection";

/** The pot as the plan and the placement show it; `diameterCm` is `null` while unknown (P-08). */
export interface PotRecord {
  readonly id: string;
  readonly name: string;
  readonly diameterCm: number | null;
}

/** The open placement of a plant after a write; `placedOn` is `null` when the plant left its pot. */
export interface PlacementResult {
  readonly potId: string | null;
  readonly placedOn: string | null;
  /** `false` when the call changed nothing (the plant was in this pot already, or was in no pot). */
  readonly changed: boolean;
}

/** A pot that is not an own active pot, or one a plant that is not archived holds (equipment.pot_*). */
export type PlaceRefusal = "pot_not_found" | "pot_taken";

/**
 * Every call applies only to the account `userId` (P-04): a foreign or unknown pot looks like a missing one. The write
 * closes the plant's open placement and every stale placement of an archived plant in the same pot, then opens the new
 * one, in one transaction (the adapter); a refusal writes nothing.
 */
export interface PotPlacementStore {
  place(
    userId: string,
    specimenId: string,
    potId: string | null,
    day: string,
  ): Promise<PlacementResult | PlaceRefusal>;
  /** The pot the plant sits in today (its open placement), `null` when it sits in none. */
  currentPot(userId: string, specimenId: string): Promise<PotRecord | null>;
  /** The active pots of the account that no plant which is not archived holds, by name (US-EQU-01, US-BES-19). */
  freePots(userId: string): Promise<readonly PotRecord[]>;
}

/** What a repot with a pot runs inside one transaction: the repot of the plant and the placement (one unit of work). */
export interface PotRepotSteps {
  readonly specimens: Pick<SpecimenStore, "find" | "repot">;
  readonly pots: PotPlacementStore;
}

/** The port of the transaction that runs both steps together (the handover pattern, ADR 0012); a refused step rolls back. */
export interface PotRepotUnit {
  run<T>(
    userId: string,
    work: (steps: PotRepotSteps) => Promise<{ readonly commit: boolean; readonly value: T }>,
  ): Promise<T>;
}

/** The keeper switch of the equipment (US-ONB-09, P-12): while off, a pot is named by no operation (pot data stays). */
export const EQUIPMENT_KEEPER_SWITCH = "equipment";
