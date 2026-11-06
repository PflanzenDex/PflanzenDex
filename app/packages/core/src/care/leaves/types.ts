// Leaf log (US-WAC-07, DM-WAC-02). Ports for persistence; adapters live in `db` (AB-1). The photo of a leaf is a follow-up.
import type { LeafComparison } from "./comparison";

/** The keeper switch of the leaf log (US-ONB-09, P-12); while it is off no leaves are shown and nothing is written. */
export const LEAF_KEEPER_SWITCH = "leaf_log";

/**
 * Limits are starting values (assumptions, US-WAC-07); the database checks the same values. A size is a whole number of
 * millimetres; a note counts characters (code points), not bytes.
 */
export const LEAF_LIMITS = {
  size: { min: 1, max: 5_000 },
  note: { min: 1, max: 500 },
} as const;

/** What is stored. The comparison and the count are derived on every read and have no column (P-01). */
export interface LeafRow {
  readonly id: string;
  readonly specimenId: string;
  /** Local calendar date `YYYY-MM-DD` of the keeper (NFR-08). */
  readonly date: string;
  /** Length in millimetres; `null` means "not measured" (P-08). */
  readonly lengthMm: number | null;
  /** Width in millimetres; `null` means "not measured" (P-08). */
  readonly widthMm: number | null;
  readonly note: string | null;
  /** Creation moment as a fixed-width UTC timestamp, so ties on one date sort as text. */
  readonly createdAt: string;
}

/** A new leaf has no id and no creation moment yet; the store sets both. */
export type LeafValues = Omit<LeafRow, "id" | "createdAt">;

/** The read of one plant's leaves: the count, the comparison and the leaves newest first, for one keeper (P-04). */
export interface LeafLogView {
  readonly specimenId: string;
  /** True while the keeper switch is off: the view then holds no leaves, and the stored rows stay (P-12, P-10). */
  readonly keeperOff: boolean;
  readonly count: number;
  readonly comparison: LeafComparison | null;
  readonly leaves: readonly LeafRow[];
}

/** Every call applies to the account `userId` only (P-04). */
export interface LeafStore {
  /** All leaves of the specimen, newest first (date, with the same date the one created last). */
  list(userId: string, specimenId: string): Promise<readonly LeafRow[]>;
  /** One insert; a specimen of another account counts as unknown and writes nothing. */
  create(userId: string, values: LeafValues): Promise<LeafRow | "specimen_unknown">;
  /** Deletes the leaf if it belongs to the account and to that specimen; `false` otherwise (nothing deleted, P-04). */
  remove(userId: string, specimenId: string, leafId: string): Promise<boolean>;
}
