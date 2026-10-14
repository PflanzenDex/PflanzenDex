import type { WishStatus } from "../../wishlist";
import type { EquipmentType } from "../store/types";

/**
 * A wish of type equipment (US-EQU-08, DM-WUN-01 `Type: equipment`): a device or consumable the keeper wants. It lives
 * in the table of the wishes, but is never a plant candidate: it has no target zone and never counts for the buffer
 * (US-WUN-02). Price and product id are optional and stay unknown instead of guessed (P-08).
 */
export interface EquipmentWishRow {
  readonly id: string;
  readonly name: string;
  readonly equipmentType: EquipmentType;
  readonly productId: string | null;
  readonly priceEur: number | null;
  readonly status: WishStatus;
}

/** `nameKey` is derived from the name (`wishNameKey`): the name is unique among all wishes of the account (FR-WUN-06). */
export interface EquipmentWishValues {
  readonly name: string;
  readonly nameKey: string;
  readonly equipmentType: EquipmentType;
  readonly productId: string | null;
  readonly priceEur: number | null;
}

/** A wish after a status change; `changed` is false when nothing was written. */
export interface EquipmentWishChange {
  readonly wish: EquipmentWishRow;
  readonly changed: boolean;
}

/** Every call applies to the account `userId` only (P-04); a foreign wish looks like an unknown one. */
export interface EquipmentWishStore {
  create(userId: string, values: EquipmentWishValues): Promise<EquipmentWishRow | "name_taken">;
  /** Equipment wishes of any status, open ones first by age, then bought and discarded by name. */
  list(userId: string): Promise<readonly EquipmentWishRow[]>;
  /** An open wish becomes `bought`; one that is bought already is returned unchanged; `not_open`: discarded. */
  buy(userId: string, wishId: string): Promise<EquipmentWishChange | "not_found" | "not_open">;
  /** An open wish becomes `discarded` (kept, P-10); `not_open`: it is bought and stays bought. */
  discard(userId: string, wishId: string): Promise<EquipmentWishChange | "not_found" | "not_open">;
}
