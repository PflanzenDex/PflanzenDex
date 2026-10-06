import type { LightZone, ZoneStore } from "../../light";
import type { CareProfile, CareProfileChanges, CareProfileStore } from "./care-profile-types";

const EMPTY: Omit<CareProfile, "speciesId"> = {
  growthLocationId: null,
  dormancyLocationId: null,
  lightZoneId: null,
  dormancyFrom: null,
  dormancyUntil: null,
  wateringGrowthDays: null,
  wateringDormancyDays: null,
  ownHints: null,
};

/**
 * In-memory adapter for tests only; the real adapter lives in `db`. `known` names the locations and zones of each
 * account and replaces the composite foreign keys; profiles are kept per account (P-04).
 */
export class InMemoryCareProfiles implements CareProfileStore {
  readonly rows: (CareProfile & { userId: string })[] = [];
  writes = 0;

  constructor(
    private readonly known: Readonly<
      Record<string, { locations?: readonly string[]; zones?: readonly string[] }>
    > = {},
  ) {}

  async list(userId: string): Promise<readonly CareProfile[]> {
    return this.rows
      .filter((r) => r.userId === userId)
      .map(({ userId: owner, ...row }) => {
        void owner;
        return row;
      });
  }

  async update(userId: string, speciesId: string, changes: CareProfileChanges) {
    this.writes += 1;
    const locations = [changes.growthLocationId, changes.dormancyLocationId];
    const own = this.known[userId];
    if (locations.some((id) => id && !own?.locations?.includes(id)))
      return "location_unknown" as const;
    if (changes.lightZoneId && !own?.zones?.includes(changes.lightZoneId))
      return "zone_unknown" as const;
    const i = this.rows.findIndex((r) => r.userId === userId && r.speciesId === speciesId);
    const base = this.rows[i] ?? { userId, speciesId, ...EMPTY };
    const row = { ...base, ...changes };
    if (i < 0) this.rows.push(row);
    else this.rows[i] = row;
    const { userId: owner, ...profile } = row;
    void owner;
    return profile;
  }
}

/** Zones of an account for tests of the view (levels 1 to 4, the lowest is cutting light). */
export const zoneStore = (
  zones: Readonly<Record<string, readonly LightZone[]>>,
): Pick<ZoneStore, "list"> => ({ list: async (userId) => zones[userId] ?? [] });
