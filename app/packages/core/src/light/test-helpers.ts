import type {
  LightLocation,
  LightLocationStore,
  LightZone,
  LocationValues,
  ZoneUser,
  ZoneUsage,
  ZoneStore,
  ZoneValues,
} from "./types";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** In-memory adapter for tests only; the real adapter lives in `db`. Accounts are separate (P-04). */
export class InMemoryLight {
  readonly zones: (LightZone & { userId: string })[] = [];
  readonly locations: (LightLocation & { userId: string })[] = [];
  private counter = 0;

  listZones(userId: string): readonly LightZone[] {
    return this.zones.filter((z) => z.userId === userId).sort((a, b) => a.sortOrder - b.sortOrder);
  }
  listLocations(userId: string): readonly LightLocation[] {
    return this.locations.filter((s) => s.userId === userId);
  }

  zoneAdapter(): ZoneStore {
    return {
      list: async (n) => this.listZones(n),
      create: async (n, w) => this.zoneCreate(n, w),
      update: async (n, id, w) => this.zoneUpdate(n, id, w),
      remove: async (n, id) => this.zoneDelete(n, id),
    };
  }

  locationAdapter(): LightLocationStore {
    return {
      list: async (n) => this.listLocations(n),
      create: async (n, w) => this.locationCreate(n, w),
      update: async (n, id, w) => this.locationUpdate(n, id, w),
    };
  }

  private zoneCreate(userId: string, w: ZoneValues): LightZone | "name_taken" {
    if (this.zones.some((z) => z.userId === userId && same(z.name, w.name))) return "name_taken";
    const own = this.listZones(userId);
    const sortOrder = w.sortOrder ?? Math.max(0, ...own.map((z) => z.sortOrder)) + 1;
    const row = { id: id(++this.counter), userId, ...w, sortOrder };
    this.zones.push(row);
    return row;
  }

  private zoneUpdate(
    userId: string,
    id: string,
    w: ZoneValues,
  ): LightZone | "name_taken" | "not_found" {
    const i = this.zones.findIndex((z) => z.id === id && z.userId === userId);
    const alt = this.zones[i];
    if (!alt) return "not_found";
    if (this.zones.some((z) => z.userId === userId && z.id !== id && same(z.name, w.name)))
      return "name_taken";
    const fresh = { ...alt, ...w, sortOrder: w.sortOrder ?? alt.sortOrder };
    this.zones[i] = fresh;
    return fresh;
  }

  private zoneDelete(userId: string, id: string): "deleted" | "not_found" | "in_use" {
    const i = this.zones.findIndex((z) => z.id === id && z.userId === userId);
    if (i < 0) return "not_found";
    if (this.locations.some((s) => s.lightZoneId === id)) return "in_use";
    this.zones.splice(i, 1);
    return "deleted";
  }

  private zonePresent(userId: string, id: string | null): boolean {
    return id === null || this.zones.some((z) => z.id === id && z.userId === userId);
  }

  private locationCreate(
    userId: string,
    w: LocationValues,
  ): LightLocation | "name_taken" | "zone_unknown" {
    if (this.locations.some((s) => s.userId === userId && same(s.name, w.name)))
      return "name_taken";
    if (!this.zonePresent(userId, w.lightZoneId)) return "zone_unknown";
    const row = { id: id(++this.counter), userId, ...w };
    this.locations.push(row);
    return row;
  }

  private locationUpdate(
    userId: string,
    id: string,
    w: LocationValues,
  ): LightLocation | "name_taken" | "not_found" | "zone_unknown" {
    const i = this.locations.findIndex((s) => s.id === id && s.userId === userId);
    const alt = this.locations[i];
    if (!alt) return "not_found";
    if (this.locations.some((s) => s.userId === userId && s.id !== id && same(s.name, w.name)))
      return "name_taken";
    if (!this.zonePresent(userId, w.lightZoneId)) return "zone_unknown";
    const fresh = { ...alt, ...w };
    this.locations[i] = fresh;
    return fresh;
  }

  /** Usage source "locations", as `db` supplies it. */
  locationUsage(): ZoneUsage {
    return {
      user: async (n, zoneId) =>
        this.listLocations(n)
          .filter((s) => s.lightZoneId === zoneId)
          .map((s): ZoneUser => ({ kind: "location", id: s.id, name: s.name })),
    };
  }
}

/** Fake for the still missing sources (specimens, species): names fixed users per zone. */
export const fixedUsage = (user: readonly ZoneUser[]): ZoneUsage => ({
  user: async () => user,
});
