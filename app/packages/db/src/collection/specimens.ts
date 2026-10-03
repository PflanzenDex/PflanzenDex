import type { Pool } from "pg";
import { withAccount } from "../kernel/index.ts";

// Same shapes as the interfaces in `core` (structurally equal; `db` does not import `core`).
export interface SpecimenRow {
  readonly id: string;
  readonly speciesId: string;
  readonly name: string;
  readonly marker: string | null;
  readonly locationId: string | null;
  readonly status: "plant" | "cutting" | "archived";
  readonly caughtAt: string | null;
}
export type SpecimenValues = Pick<
  SpecimenRow,
  "speciesId" | "name" | "marker" | "locationId" | "caughtAt"
>;

// `date` comes back as text: the driver would turn it into a `Date` in the server's time zone (NFR-08).
const COLUMNS = `id, species_id as "speciesId", name, marker, location_id as "locationId", status,
  to_char(caught_at, 'YYYY-MM-DD') as "caughtAt"`;

const UNIQUE = "23505";
const FOREIGN_KEY = "23503";
const pgError = (e: unknown) => e as { code?: string; constraint?: string };

/**
 * Adapter for specimens; every call runs as the caller's account under the row rules (P-04). The location
 * hangs on the own account via the composite foreign key (account_id, location_id). The species has no
 * foreign key: the catalog carries no account id, AB-10 allows only `(account_id, id)`; the operation in `core`
 * instead checks that the account may see the species, and the application cannot delete species.
 */
export class SpecimenPostgres {
  constructor(private readonly pool: Pool) {}

  async list(userId: string): Promise<readonly SpecimenRow[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<SpecimenRow>(`select ${COLUMNS} from specimen order by lower(name)`),
    );
    return r.rows;
  }

  async find(userId: string, id: string): Promise<SpecimenRow | null> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<SpecimenRow>(`select ${COLUMNS} from specimen where id = $1`, [id]),
    );
    return r.rows[0] ?? null;
  }

  /** One statement: all or nothing. The database decides name uniqueness, not a prior query. */
  async create(
    userId: string,
    w: SpecimenValues,
  ): Promise<SpecimenRow | "name_taken" | "location_unknown"> {
    try {
      const r = await withAccount(this.pool, userId, (c) =>
        c.query<SpecimenRow>(
          `insert into specimen (account_id, species_id, name, marker, location_id, caught_at)
           values ($1, $2, $3, $4, $5, $6) returning ${COLUMNS}`,
          [userId, w.speciesId, w.name, w.marker, w.locationId, w.caughtAt],
        ),
      );
      return r.rows[0] as SpecimenRow;
    } catch (e) {
      if (pgError(e).code === UNIQUE && pgError(e).constraint === "specimen_name_per_account")
        return "name_taken";
      if (pgError(e).code === FOREIGN_KEY && pgError(e).constraint === "specimen_location")
        return "location_unknown";
      throw e;
    }
  }
}
