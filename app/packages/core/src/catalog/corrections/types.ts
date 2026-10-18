// Corrections of catalog values and the version history of every field (US-BES-16, DM-BES-06, DM-BES-07, FR-BES-12,
// FR-BES-19). Cut 1: the three text fields the open sources fill; votes (US-BES-15) are in; withdrawing a correction (US-BES-14) is later.

/** Fields a correction can name, with their limits (match the database checks). */
export const CORRECTION_LIMITS = {
  familyLatin: 120,
  germanName: 120,
  botanicalStory: 1000,
} as const;
export type CorrectionField = keyof typeof CORRECTION_LIMITS;
export const CORRECTION_FIELDS = Object.keys(CORRECTION_LIMITS) as readonly CorrectionField[];
export const REASON_MAX = 500;
export const SOURCE_MAX = 500;

export type CorrectionStatus = "open" | "accepted" | "rejected" | "withdrawn";
/** Where a version of a value came from (DM-BES-06). */
export type Origin = "source" | "ai" | "community" | "reviewer" | "operator";

export interface Correction {
  readonly id: string;
  readonly speciesId: string;
  readonly latinName: string;
  readonly field: CorrectionField;
  /** The catalog value when the correction was made; `null` = it was unknown (P-08). */
  readonly oldValue: string | null;
  readonly proposedValue: string;
  readonly reason: string;
  readonly source: string | null;
  readonly status: CorrectionStatus;
  /** ISO timestamps (UTC); the age is derived from `createdAt`, never stored. */
  readonly createdAt: string;
  readonly decidedAt: string | null;
  /** Shown to the creator as a hint (P-10); reviewers see it too. */
  readonly decisionReason: string | null;
}

/** An entry of the review list: the correction with the value the catalog holds now (it may have changed since). */
export interface CorrectionEntry extends Correction, VoteCounts {
  readonly currentValue: string | null;
}

/** How many accounts confirmed ("Stimmt") or disputed ("Stimmt nicht"); never who (US-BES-15, P-05). */
export interface VoteCounts {
  readonly confirmations: number;
  readonly disputes: number;
}
export type Vote = "confirm" | "dispute";
export const VOTES_PER_HOUR = 50;

/** An open correction of a species as every keeper sees it: no creator, the own vote and whether it is the own proposal. */
export interface OpenCorrection extends VoteCounts {
  readonly id: string;
  readonly field: CorrectionField;
  readonly proposedValue: string;
  readonly reason: string;
  readonly source: string | null;
  readonly createdAt: string;
  readonly myVote: Vote | null;
  readonly mine: boolean;
}

export type VoteOutcome = "voted" | "not_found" | "decided" | "own" | "rate_limited";

/** One version of a field (DM-BES-06). `setBy` is for reviewers only (P-05) and removed for everybody else. */
export interface FieldVersion {
  readonly version: number;
  readonly value: string;
  readonly origin: Origin;
  /** Source name, link, license and retrieval date for origin `source`. */
  readonly source: {
    readonly name: string;
    readonly link: string;
    readonly license: string;
    readonly retrievedOn: string;
  } | null;
  /** Free-text citation of a keeper or AI value. */
  readonly citation: string | null;
  readonly disputed: boolean;
  readonly setAt: string;
  readonly setBy: string | null;
}

export type DecisionOutcome = "not_found" | "decided";

/** Persistence port (adapter in `db`); the adapter enforces the rights again by database functions (P-04). */
export interface CorrectionStore {
  /** Latin name and current value of an approved species visible to the caller; `null` otherwise. */
  speciesValue(
    userId: string,
    speciesId: string,
    field: CorrectionField,
  ): Promise<{ latinName: string; value: string | null } | null>;
  /** `duplicate` carries the open correction with the same field and value. */
  create(
    userId: string,
    v: {
      speciesId: string;
      field: CorrectionField;
      proposedValue: string;
      reason: string;
      source: string | null;
    },
  ): Promise<Correction | { duplicate: string }>;
  /** Sets, changes or (`null`) withdraws the caller's vote; one vote per account and correction (US-BES-15). */
  vote(userId: string, id: string, vote: Vote | null): Promise<VoteOutcome>;
  /** Open corrections of an approved species; `null` if it is not visible or not approved (P-04). */
  listForSpecies(userId: string, speciesId: string): Promise<readonly OpenCorrection[] | null>;
  /** Open corrections of all accounts (reviewers only), oldest first. */
  listOpen(userId: string): Promise<readonly CorrectionEntry[]>;
  /** The caller's own corrections of any status, newest first. */
  listMine(userId: string): Promise<readonly Correction[]>;
  accept(userId: string, id: string): Promise<{ version: number } | DecisionOutcome>;
  reject(userId: string, id: string, reason: string): Promise<"rejected" | DecisionOutcome>;
  /** All versions of a field, newest first; `null` if the species is not visible to the caller. */
  history(
    userId: string,
    speciesId: string,
    field: CorrectionField,
  ): Promise<readonly FieldVersion[] | null>;
  /** The earlier value comes back as a new version. */
  revert(
    userId: string,
    speciesId: string,
    field: CorrectionField,
    version: number,
  ): Promise<{ version: number } | "not_found" | "unchanged">;
}
