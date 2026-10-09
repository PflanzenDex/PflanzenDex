// Wishlist (US-WUN-01, DM-WUN-01). Ports for persistence and for the stock per light zone; adapters live in `db` and in
// the app root (AB-1, ADR 0003: the wishlist asks, it never reaches into `collection` itself).

/** Limits are assumptions (starting values); the database checks the same values for text. */
export const WISH_LIMITS = {
  name: { min: 1, max: 120 },
  german: { min: 1, max: 120 },
  reasoning: { min: 1, max: 500 },
  imageUrl: { min: 1, max: 500 },
  imageSource: { min: 1, max: 300 },
  license: { min: 1, max: 100 },
  /** FR-WUN-04: the same number 1 to 3 everywhere. */
  difficulty: { min: 1, max: 3 },
} as const;

export const WISH_STATUS = ["wishlist", "bought", "discarded"] as const;
export type WishStatus = (typeof WISH_STATUS)[number];

/** What is stored of a wish (DM-WUN-01, as far as US-WUN-01 needs it). Rank and texts are derived (P-01). */
export interface WishRow {
  readonly id: string;
  readonly name: string;
  /** `null` = no German name known (P-08). */
  readonly german: string | null;
  /** Target light zone of the account; `null` = unknown (P-08). */
  readonly targetZoneId: string | null;
  /** 1 to 3 (FR-WUN-04); `null` = unknown (P-08). */
  readonly difficulty: number | null;
  readonly reasoning: string | null;
  readonly imageUrl: string | null;
  /** Always set together with `imageUrl`. */
  readonly imageSource: string | null;
  readonly license: string | null;
  /**
   * Object name of the stored copy of the image (US-WUN-04, `<uuid>.jpg` in the object store); `null` until it is
   * stored. The address above is only the origin, it is never loaded by a viewer (P-05).
   */
  readonly imageObject: string | null;
  readonly type: "plant";
  readonly status: WishStatus;
  /** The specimen this wish became ("bought → specimen", US-WUN-05); `null` until it is linked. */
  readonly specimenId: string | null;
}

/** The values of a new wish; `nameKey` is derived from the name (`wishNameKey`) and makes the name unique per account. */
export type WishValues = Omit<WishRow, "id" | "type" | "status" | "specimenId" | "imageObject"> & {
  readonly nameKey: string;
};

/** A wish after a status change ("Bought", US-WUN-03; "Discarded", US-WUN-05). `changed` is false when nothing was written. */
export interface WishChange {
  readonly wish: WishRow;
  readonly changed: boolean;
}
/** A wish after "Bought" (US-WUN-03). `changed` is false when it was bought already: nothing was written again. */
export type WishPurchase = WishChange;

/** Every call applies to the account `userId` only (P-04). */
export interface WishStore {
  /** `name_taken`: a wish of the account has that name (FR-WUN-06); `zone_unknown`: not a zone of the account. */
  create(userId: string, values: WishValues): Promise<WishRow | "name_taken" | "zone_unknown">;
  /** One wish of the account of any status; `null` if there is none (a foreign one looks the same, P-04). */
  find(userId: string, wishId: string): Promise<WishRow | null>;
  /**
   * Records the stored copy of the wish image with its verified source and license (US-WUN-04). `null`: no wish of the
   * account (nothing written, P-04).
   */
  setImage(
    userId: string,
    wishId: string,
    image: { readonly object: string; readonly source: string; readonly license: string },
  ): Promise<WishRow | null>;
  /** Open plant wishes (`status = wishlist`, FR-WUN-02), oldest first. */
  open(userId: string): Promise<readonly WishRow[]>;
  /**
   * Sets an open wish to `bought` (US-WUN-03) in one step. An already bought wish is returned unchanged
   * (`changed: false`); `not_found`: no wish of the account (a foreign one looks the same, P-04); `not_open`: discarded.
   */
  buy(userId: string, wishId: string): Promise<WishPurchase | "not_found" | "not_open">;
  /** Bought plant wishes, the history of US-WUN-03; by name. */
  bought(userId: string): Promise<readonly WishRow[]>;
  /**
   * Sets an open wish to `discarded` (US-WUN-05) in one step; it is kept, never deleted (P-10). A wish that is discarded
   * already is returned unchanged; `not_found` as for `buy`; `not_open`: the wish is bought and stays bought.
   */
  discard(userId: string, wishId: string): Promise<WishChange | "not_found" | "not_open">;
  /** Discarded plant wishes, so a discarded wish stays readable (P-10); by name. */
  discarded(userId: string): Promise<readonly WishRow[]>;
  /**
   * Links a bought wish to the specimen it became (US-WUN-05). Linking the same specimen again changes nothing.
   * `not_found`: no wish of the account (a foreign one looks the same, P-04); `not_bought`: only a bought wish is linked;
   * `specimen_unknown`: not a specimen of the account; `already_linked`: the wish has another specimen, or the specimen
   * belongs to another wish.
   */
  link(
    userId: string,
    wishId: string,
    specimenId: string,
  ): Promise<WishChange | "not_found" | "not_bought" | "specimen_unknown" | "already_linked">;
  /**
   * Open plant wishes that have no name key (FR-WUN-06, #303): they collided with an older wish after folding when
   * migration 0020 ran and are exempt from the unique name rule. Oldest first.
   */
  keyless(userId: string): Promise<readonly WishRow[]>;
  /**
   * Renames a wish that has no name key and sets its key in one step, so it leaves the exempt group. `not_found`: no
   * wish of the account (a foreign one looks the same, P-04); `not_duplicate`: the wish has a key already;
   * `name_taken`: another wish has that name key.
   */
  rename(
    userId: string,
    wishId: string,
    name: string,
    nameKey: string,
  ): Promise<WishRow | "not_found" | "not_duplicate" | "name_taken">;
  /** Deletes a wish that has no name key; `not_found` / `not_duplicate` as for `rename`. Returns the deleted wish. */
  remove(userId: string, wishId: string): Promise<WishRow | "not_found" | "not_duplicate">;
  /** Wishes of any status that point at the zone (so a zone in use is not deleted unnoticed). */
  usingZone(userId: string, zoneId: string): Promise<readonly WishRow[]>;
}

/** Stock of one target zone (zones 2 to 4): the number of active specimens that count there (FR-LIC-04). */
export interface ZoneStock {
  readonly zoneId: string;
  readonly name: string;
  readonly count: number;
}

/**
 * Port "stock per light zone": zones 2 to 4 of the account in zone order, also with count 0. The app root implements
 * it from the light distribution of `collection` (US-LIC-02); the wishlist never counts specimens itself.
 */
export interface ZoneStockSource {
  stock(userId: string): Promise<readonly ZoneStock[]>;
  /** The zones of the account that do not count (the cutting light); only used to name them in hints (FR-WUN-03). */
  uncounted?(userId: string): Promise<readonly OutsideZone[]>;
  /**
   * The buffer of open candidates per zone the account wants (US-WUN-02, account setting of US-ACC-02); without this
   * method the default applies.
   */
  buffer?(userId: string): Promise<number>;
}

/** A zone that is not among zones 2 to 4 (the cutting light, FR-LIC-02). */
export interface OutsideZone {
  readonly zoneId: string;
  readonly name: string;
}
