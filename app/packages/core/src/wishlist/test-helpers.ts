import type {
  WishPurchase,
  WishRow,
  WishStatus,
  WishStore,
  WishValues,
  ZoneStock,
  ZoneStockSource,
} from "./types";
import { wishNameKey } from "./name-key";

/** In-memory adapter for tests only; the real adapter lives in `db`. Zones are the ones each account owns. */
export class InMemoryWishes implements WishStore {
  readonly rows: (Omit<WishRow, "status"> & {
    status: WishStatus;
    userId: string;
    nameKey?: string;
    /** No name key (migration 0020): exempt from the unique name rule (FR-WUN-06, #303). */
    keyless?: boolean;
  })[] = [];
  writes = 0;

  constructor(private readonly zones: Readonly<Record<string, readonly string[]>> = {}) {}

  async create(
    userId: string,
    values: WishValues,
  ): Promise<WishRow | "name_taken" | "zone_unknown"> {
    this.writes += 1;
    if (values.targetZoneId !== null && !this.zones[userId]?.includes(values.targetZoneId))
      return "zone_unknown";
    if (
      this.rows.some(
        (r) =>
          r.userId === userId &&
          !r.keyless &&
          (r.nameKey ?? wishNameKey(r.name)) === values.nameKey,
      )
    )
      return "name_taken";
    const { nameKey, ...fields } = values;
    const row: WishRow = {
      ...fields,
      id: `w${this.rows.length + 1}`,
      type: "plant",
      status: "wishlist",
    };
    this.rows.push({ ...row, userId, nameKey });
    return row;
  }

  /** Test setup: puts a wish with any status straight into the table. */
  seed(
    userId: string,
    row: Partial<WishRow> & { id: string; name: string; keyless?: boolean },
  ): void {
    this.rows.push({
      german: null,
      targetZoneId: null,
      difficulty: null,
      reasoning: null,
      imageUrl: null,
      imageSource: null,
      license: null,
      type: "plant",
      status: "wishlist" as WishStatus,
      ...row,
      userId,
    });
  }

  async open(userId: string): Promise<readonly WishRow[]> {
    return this.rows.filter((r) => r.userId === userId && r.status === "wishlist").map(bare);
  }

  async buy(userId: string, wishId: string): Promise<WishPurchase | "not_found" | "not_open"> {
    const row = this.rows.find((r) => r.userId === userId && r.id === wishId);
    if (!row) return "not_found";
    if (row.status === "discarded") return "not_open";
    if (row.status === "bought") return { wish: bare(row), changed: false };
    this.writes += 1;
    row.status = "bought";
    return { wish: bare(row), changed: true };
  }

  async bought(userId: string): Promise<readonly WishRow[]> {
    return this.rows
      .filter((r) => r.userId === userId && r.status === "bought")
      .sort(
        (a, b) =>
          a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.id.localeCompare(b.id),
      )
      .map(bare);
  }

  async keyless(userId: string): Promise<readonly WishRow[]> {
    return this.rows
      .filter((r) => r.userId === userId && r.keyless && r.status === "wishlist")
      .map(bare);
  }

  async rename(
    userId: string,
    wishId: string,
    name: string,
    nameKey: string,
  ): Promise<WishRow | "not_found" | "not_duplicate" | "name_taken"> {
    const row = this.rows.find((r) => r.userId === userId && r.id === wishId);
    if (!row) return "not_found";
    if (!row.keyless) return "not_duplicate";
    const taken = this.rows.some(
      (r) =>
        r.userId === userId &&
        r !== row &&
        !r.keyless &&
        (r.nameKey ?? wishNameKey(r.name)) === nameKey,
    );
    if (taken) return "name_taken";
    this.writes += 1;
    const renamed = { ...row, name, nameKey, keyless: false };
    this.rows[this.rows.indexOf(row)] = renamed;
    return bare(renamed);
  }

  async remove(userId: string, wishId: string): Promise<WishRow | "not_found" | "not_duplicate"> {
    const i = this.rows.findIndex((r) => r.userId === userId && r.id === wishId);
    const row = this.rows[i];
    if (!row) return "not_found";
    if (!row.keyless) return "not_duplicate";
    this.writes += 1;
    this.rows.splice(i, 1);
    return bare(row);
  }

  async usingZone(userId: string, zoneId: string): Promise<readonly WishRow[]> {
    return this.rows.filter((r) => r.userId === userId && r.targetZoneId === zoneId).map(bare);
  }
}

const bare = ({
  userId: owner,
  nameKey: key,
  keyless: free,
  ...row
}: WishRow & { userId: string; nameKey?: string; keyless?: boolean }): WishRow => {
  void owner;
  void key;
  void free;
  return row;
};

/** Stock per zone and account for tests only (the real source is the light distribution of `collection`). */
export class ZoneStockStub implements ZoneStockSource {
  readonly calls: string[] = [];

  constructor(private readonly table: Readonly<Record<string, readonly ZoneStock[]>>) {}

  async stock(userId: string): Promise<readonly ZoneStock[]> {
    this.calls.push(userId);
    return this.table[userId] ?? [];
  }
}
