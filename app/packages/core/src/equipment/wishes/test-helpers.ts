import { wishNameKey } from "../../wishlist/repair/name-key";
import type {
  EquipmentWishChange,
  EquipmentWishRow,
  EquipmentWishStore,
  EquipmentWishValues,
} from "./types";

/** In-memory adapter for tests only; the real adapter lives in `db`. */
export class InMemoryEquipmentWishes implements EquipmentWishStore {
  readonly rows: (EquipmentWishRow & { userId: string })[] = [];
  writes = 0;

  async create(userId: string, v: EquipmentWishValues): Promise<EquipmentWishRow | "name_taken"> {
    this.writes += 1;
    if (this.rows.some((r) => r.userId === userId && wishNameKey(r.name) === v.nameKey))
      return "name_taken";
    const row = {
      id: `00000000-0000-4000-8000-${String(this.rows.length + 1).padStart(12, "0")}`,
      name: v.name,
      equipmentType: v.equipmentType,
      productId: v.productId,
      priceEur: v.priceEur,
      status: "wishlist" as const,
    };
    this.rows.push({ ...row, userId });
    return row;
  }

  async list(userId: string): Promise<readonly EquipmentWishRow[]> {
    return this.rows.filter((r) => r.userId === userId);
  }

  private change(userId: string, id: string, to: "bought" | "discarded") {
    const row = this.rows.find((r) => r.userId === userId && r.id === id);
    if (!row) return "not_found" as const;
    if (row.status === to) return { wish: row, changed: false } satisfies EquipmentWishChange;
    if (row.status !== "wishlist") return "not_open" as const;
    this.writes += 1;
    row.status = to;
    return { wish: row, changed: true } satisfies EquipmentWishChange;
  }

  async buy(userId: string, id: string) {
    return this.change(userId, id, "bought");
  }

  async discard(userId: string, id: string) {
    return this.change(userId, id, "discarded");
  }
}
