import type { Pool } from "pg";

// Same shape as `CareProfile` in `core` (structurally equal; `db` does not import `core`).
export interface CareProfileRow {
  readonly speciesId: string;
  readonly growthLocationId: string | null;
  readonly dormancyLocationId: string | null;
  readonly lightZoneId: string | null;
  readonly dormancyFrom: string | null;
  readonly dormancyUntil: string | null;
  readonly wateringGrowthDays: number | null;
  readonly wateringDormancyDays: number | null;
  readonly ownHints: string | null;
}

export type CareProfileChanges = Partial<Omit<CareProfileRow, "speciesId">>;

/** Adapter for the care profile (US-BES-09). Skeleton: the behavior follows the tests. */
export class CareProfilePostgres {
  constructor(private readonly pool: Pool) {
    void this.pool;
  }

  async list(userId: string): Promise<readonly CareProfileRow[]> {
    void userId;
    return [];
  }

  async update(
    userId: string,
    speciesId: string,
    changes: CareProfileChanges,
  ): Promise<CareProfileRow | "location_unknown" | "zone_unknown"> {
    void userId;
    void speciesId;
    void changes;
    throw new Error("not implemented");
  }
}
