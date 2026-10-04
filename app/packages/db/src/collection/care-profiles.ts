import type { Pool } from "pg";
import { withAccount } from "../kernel/index.ts";
import { FOREIGN_KEY, SpeciesGone, ensureSpeciesVisible, pgError } from "./specimen-shared.ts";

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

/** Field name -> column; the order is the order of the parameters. */
const COLUMN_OF: Record<keyof CareProfileChanges, string> = {
  growthLocationId: "growth_location_id",
  dormancyLocationId: "dormancy_location_id",
  lightZoneId: "light_zone_id",
  dormancyFrom: "dormancy_from",
  dormancyUntil: "dormancy_until",
  wateringGrowthDays: "watering_growth_days",
  wateringDormancyDays: "watering_dormancy_days",
  ownHints: "own_hints",
};
const COLUMNS = `species_id as "speciesId", ${Object.entries(COLUMN_OF)
  .map(([field, column]) => `${column} as "${field}"`)
  .join(", ")}`;

/**
 * Adapter for the care profile (US-BES-09, DM-BES-04); every call runs as the account of the caller under the row rule
 * (P-04, P-05). Locations and zone hang on the own account through composite foreign keys (account_id, id); the species
 * hangs on the catalog through the plain key `care_profile_species` (global reference table, AB-10).
 */
export class CareProfilePostgres {
  constructor(private readonly pool: Pool) {}

  async list(userId: string): Promise<readonly CareProfileRow[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<CareProfileRow>(`select ${COLUMNS} from care_profile order by species_id`),
    );
    return r.rows;
  }

  /**
   * One statement: creates the profile on first use and sets exactly the named fields (a `null` resets one); the
   * others stay as they are. A location or zone of another account violates a composite foreign key and nothing is
   * written.
   */
  async update(
    userId: string,
    speciesId: string,
    changes: CareProfileChanges,
  ): Promise<CareProfileRow | "location_unknown" | "zone_unknown" | "species_unknown"> {
    const named = (Object.keys(COLUMN_OF) as (keyof CareProfileChanges)[]).filter(
      (f) => changes[f] !== undefined,
    );
    const columns = named.map((f) => COLUMN_OF[f]);
    const values = named.map((f) => changes[f] as unknown);
    const insertColumns = ["account_id", "species_id", ...columns].join(", ");
    const marks = [...values, userId, speciesId].map((_, i) => `$${i + 1}`);
    // The parameters are the values first, then account and species, so the placeholders line up with the columns.
    const placeholders = [marks[values.length], marks[values.length + 1], ...marks.slice(0, -2)];
    const set = [...columns.map((c) => `${c} = excluded.${c}`), "updated_at = now()"].join(", ");
    try {
      return await withAccount(this.pool, userId, async (c) => {
        const r = await c.query<CareProfileRow>(
          `insert into care_profile (${insertColumns}) values (${placeholders.join(", ")})
           on conflict (account_id, species_id) do update set ${set} returning ${COLUMNS}`,
          [...values, userId, speciesId],
        );
        await ensureSpeciesVisible(c, speciesId);
        return r.rows[0] as CareProfileRow;
      });
    } catch (e) {
      if (e instanceof SpeciesGone) return "species_unknown";
      if (pgError(e).code === FOREIGN_KEY) {
        const constraint = pgError(e).constraint ?? "";
        if (constraint === "care_profile_light_zone") return "zone_unknown";
        if (constraint.endsWith("_location")) return "location_unknown";
      }
      throw e;
    }
  }
}
