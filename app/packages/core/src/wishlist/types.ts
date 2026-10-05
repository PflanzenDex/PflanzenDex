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
  readonly type: "plant";
  readonly status: WishStatus;
}

/** The values of a new wish; `nameKey` is derived from the name (`wishNameKey`) and makes the name unique per account. */
export type WishValues = Omit<WishRow, "id" | "type" | "status"> & { readonly nameKey: string };

/** A wish after "Bought" (US-WUN-03). `changed` is false when it was bought already: nothing was written again. */
export interface WishPurchase {
  readonly wish: WishRow;
  readonly changed: boolean;
}

/** Every call applies to the account `userId` only (P-04). */
export interface WishStore {
  /** `name_taken`: a wish of the account has that name (FR-WUN-06); `zone_unknown`: not a zone of the account. */
  create(userId: string, values: WishValues): Promise<WishRow | "name_taken" | "zone_unknown">;
  /** Open plant wishes (`status = wishlist`, FR-WUN-02), oldest first. */
  open(userId: string): Promise<readonly WishRow[]>;
  /**
   * Sets an open wish to `bought` (US-WUN-03) in one step. An already bought wish is returned unchanged
   * (`changed: false`); `not_found`: no wish of the account (a foreign one looks the same, P-04); `not_open`: discarded.
   */
  buy(userId: string, wishId: string): Promise<WishPurchase | "not_found" | "not_open">;
  /** Bought plant wishes, the history of US-WUN-03; by name. */
  bought(userId: string): Promise<readonly WishRow[]>;
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
}
