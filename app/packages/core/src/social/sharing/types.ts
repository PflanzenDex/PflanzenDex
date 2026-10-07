/** What a keeper can decide per specimen (US-SOZ-04): `private` (the default) or `friends`. */
export const SHARE = ["private", "friends"] as const;
export type Share = (typeof SHARE)[number];

/** One shared specimen as the owner sees it in the settings (`photos` = `Share_Photos`). */
export interface SharingRow {
  readonly specimenId: string;
  readonly photos: boolean;
}

/** The part of a specimen the sharing operations need; the adapter of `collection` answers it (ADR 0003). */
export interface SpecimenFact {
  readonly id: string;
  readonly speciesId: string;
  readonly status: "plant" | "cutting" | "archived";
}

/** Port: the owner's own specimens (a subset of `SpecimenStore` of `collection`, wired in the app root). */
export interface SpecimenLookup {
  find(userId: string, id: string): Promise<SpecimenFact | null>;
  list(userId: string): Promise<readonly SpecimenFact[]>;
}

/** Port for persistence; the adapter lives in `db` and runs as the account of the caller (AB-1, P-04). */
export interface SharingStore {
  /** Shares (`true`) or withdraws (`false`) one specimen of the caller; a repeat with the same values writes the same row. */
  set(userId: string, specimenId: string, shared: boolean, photos: boolean): Promise<void>;
  /** The same for several specimens in one transaction: all or nothing. */
  setMany(
    userId: string,
    specimenIds: readonly string[],
    shared: boolean,
    photos: boolean,
  ): Promise<void>;
  /** The caller's own sharing settings. */
  list(userId: string): Promise<readonly SharingRow[]>;
  /**
   * What `ownerId` shares with the caller. Empty unless the caller has a confirmed friendship with the owner: the
   * database checks it, so ending a friendship withdraws everything at once (US-SOZ-03, P-05).
   */
  sharedBy(userId: string, ownerId: string): Promise<readonly SharingRow[]>;
}

/** Port: the global switch "Everything private" of an account (US-ACC-02); the profile of `account` answers it. */
export interface PrivacySwitch {
  everythingPrivate(userId: string): Promise<boolean>;
}

/**
 * What a friend may see of a shared specimen, and nothing else (US-SOZ-04): species (Latin and German), specimen name,
 * caught date, whether it is a cutting, and the photo only with `Share_Photos` (photos come with US-WAC-05).
 * Never shared: location, measurement notes, treatments, markers, prices, wishlist, financial data.
 */
export interface SharedSpecimen {
  readonly id: string;
  readonly speciesLatin: string | null;
  readonly speciesGerman: string | null;
  readonly name: string;
  /** Local calendar date, `null` = unknown (P-08). */
  readonly caughtAt: string | null;
  readonly isCutting: boolean;
  readonly photoShared: boolean;
}

/** Port: the whitelisted facts of the owner's specimens; the app root composes `collection` and `catalog` (ADR 0003). */
export interface SharedFacts {
  describe(
    ownerId: string,
    specimenIds: readonly string[],
  ): Promise<readonly Omit<SharedSpecimen, "photoShared">[]>;
}
