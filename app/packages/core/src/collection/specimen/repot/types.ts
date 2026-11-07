// The repot history and the repot observations of a specimen (US-BES-19, DM-BES-09). Ports for persistence; the adapter
// lives in `db` (AB-1). The repot itself is written by `SpecimenStore.repot`, in the same transaction as the plant.

/** The keeper switch of the repot planner (US-ONB-09, P-12): while off, hints and observations are hidden and not written. */
export const REPOT_PLANNER_KEEPER_SWITCH = "repot_planner";

/** The three observations the keeper can tick (US-BES-19); fixed, a new one needs a new story. */
export const REPOT_SIGNS = ["roots_out", "dries_fast", "tips_over"] as const;
export type RepotSign = (typeof REPOT_SIGNS)[number];

/** An observation that is ticked and not yet cleared by a repot or by its keeper. */
export interface OpenSign {
  readonly sign: RepotSign;
  /** Local calendar date the keeper ticked it (NFR-08). */
  readonly tickedOn: string;
}

/** What a sign write answers for a plant that exists: the open observations after the write. */
export type SignRefusal = "not_found" | "archived" | "not_a_plant";

/** Every call applies only to the account `userId` (P-04): a foreign or unknown specimen looks like a missing one. */
export interface RepotStore {
  /** The latest repot day per specimen; never repotted specimens are absent (P-08). */
  lastRepotted(
    userId: string,
    specimenIds: readonly string[],
  ): Promise<ReadonlyMap<string, string>>;
  /** The open observations of one specimen, in the order of `REPOT_SIGNS`. */
  openSigns(userId: string, specimenId: string): Promise<readonly OpenSign[] | SignRefusal>;
  /** Ticks an observation of an active plant on `day`; an open one stays as it is, so the call is idempotent (US-QS-03). */
  tickSign(
    userId: string,
    specimenId: string,
    sign: RepotSign,
    day: string,
  ): Promise<readonly OpenSign[] | SignRefusal>;
  /** Clears an open observation of an active plant on `day`; nothing open means nothing is written (idempotent). */
  untickSign(
    userId: string,
    specimenId: string,
    sign: RepotSign,
    day: string,
  ): Promise<readonly OpenSign[] | SignRefusal>;
}
