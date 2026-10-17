/** What a keeper can decide per piece of equipment (US-EQU-12): `private` (the default) or `friends`. */
export const EQUIPMENT_SHARE = ["private", "friends"] as const;
export type EquipmentShare = (typeof EQUIPMENT_SHARE)[number];

/** The limit of the experience note is an assumption (starting value); the database checks the same value. */
export const SHARE_NOTE_LIMITS = { min: 1, max: 300 } as const;

/** The own settings of one shared piece of equipment; everything not listed is private. */
export interface EquipmentSharingRow {
  readonly equipmentId: string;
  readonly note: string | null;
}

/**
 * What a friend may see of a shared device, and nothing else (US-EQU-12): type, name, model, the light level of a
 * lamp's zone (its lux ceiling) and the free-text experience note. Never price, place of purchase, serial number,
 * location or purchase date. `null` = unknown (P-08).
 */
export interface SharedDevice {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly model: string | null;
  readonly luxCeiling: number | null;
  readonly note: string | null;
}

/** Port for persistence; the adapter lives in `db` and runs as the account of the caller (AB-1, P-04). */
export interface EquipmentSharingStore {
  /** Shares or withdraws one piece of equipment of the caller (withdrawing clears the note); `not_found`: not the caller's (P-04). */
  set(
    userId: string,
    equipmentId: string,
    shared: boolean,
    note: string | null,
  ): Promise<"ok" | "not_found">;
  list(userId: string): Promise<readonly EquipmentSharingRow[]>;
  /**
   * What `ownerId` shares with the caller, whitelist only. Empty unless both sides of the friendship are confirmed: the
   * database checks it, so ending a friendship withdraws everything at once (P-05).
   */
  sharedBy(userId: string, ownerId: string): Promise<readonly SharedDevice[]>;
}

/** Port: the global switch "Everything private" of an account (US-ACC-02), answered by `account` in the app root. */
export interface EverythingPrivate {
  everythingPrivate(userId: string): Promise<boolean>;
}
