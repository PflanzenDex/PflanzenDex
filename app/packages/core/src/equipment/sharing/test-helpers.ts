import type { EquipmentSharingRow, EquipmentSharingStore, SharedDevice } from "./types";

/** In-memory adapter for tests only; the real adapter lives in `db`. `friends` lists the confirmed pairs as `viewer>owner`. */
export class InMemoryEquipmentSharing implements EquipmentSharingStore {
  /** Equipment each account owns: id to the facts a friend may see. */
  readonly owned = new Map<string, Map<string, Omit<SharedDevice, "id" | "note">>>();
  readonly shared = new Map<string, Map<string, string | null>>();
  constructor(private readonly friends: ReadonlySet<string> = new Set()) {}

  own(userId: string, id: string, facts: Partial<Omit<SharedDevice, "id" | "note">> = {}) {
    const rows = this.owned.get(userId) ?? new Map();
    rows.set(id, { type: "Timer", name: id, model: null, luxCeiling: null, ...facts });
    this.owned.set(userId, rows);
  }

  async set(userId: string, id: string, shared: boolean, note: string | null) {
    if (!this.owned.get(userId)?.has(id)) return "not_found" as const;
    const rows = this.shared.get(userId) ?? new Map();
    if (shared) rows.set(id, note);
    else rows.delete(id);
    this.shared.set(userId, rows);
    return "ok" as const;
  }

  async list(userId: string): Promise<readonly EquipmentSharingRow[]> {
    return [...(this.shared.get(userId) ?? [])].map(([equipmentId, note]) => ({
      equipmentId,
      note,
    }));
  }

  async sharedBy(userId: string, ownerId: string): Promise<readonly SharedDevice[]> {
    if (!this.friends.has(`${userId}>${ownerId}`)) return [];
    return [...(this.shared.get(ownerId) ?? [])].map(([id, note]) => ({
      id,
      note,
      ...(this.owned.get(ownerId)?.get(id) as Omit<SharedDevice, "id" | "note">),
    }));
  }
}
