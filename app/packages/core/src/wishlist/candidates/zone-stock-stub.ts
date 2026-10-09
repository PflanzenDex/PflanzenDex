import type { OutsideZone, ZoneStock, ZoneStockSource } from "../types";

/** Stock per zone and account for tests only (the real source is the light distribution of `collection`). */
export class ZoneStockStub implements ZoneStockSource {
  readonly calls: string[] = [];

  constructor(
    private readonly table: Readonly<Record<string, readonly ZoneStock[]>>,
    private readonly outside: Readonly<Record<string, readonly OutsideZone[]>> = {},
  ) {}

  async uncounted(userId: string): Promise<readonly OutsideZone[]> {
    return this.outside[userId] ?? [];
  }

  async stock(userId: string): Promise<readonly ZoneStock[]> {
    this.calls.push(userId);
    return this.table[userId] ?? [];
  }
}
