import type { Pool, PoolClient } from "pg";
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
  readonly createdAt: string | null;
  readonly archivedAt: string | null;
  readonly archivedReason: string | null;
}

// `date` and `timestamptz` come back as text: the driver would turn it into a `Date` in the server's time zone (NFR-08).
export const COLUMNS = `id, species_id as "speciesId", name, marker, location_id as "locationId", status,
  to_char(caught_at, 'YYYY-MM-DD') as "caughtAt",
  to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt",
  to_char(archived_at, 'YYYY-MM-DD') as "archivedAt",
  archived_reason as "archivedReason"`;

export const FOREIGN_KEY = "23503";
export const pgError = (e: unknown) => e as { code?: string; constraint?: string };

export class SpeciesGone extends Error {}

/**
 * After a write that references a species: it must not have been merged away meanwhile. A merge locks the species
 * row of the proposal first, so a write that waited for that lock finds the merged case here and rolls back
 * (FR-BES-11, P-10); a write that came first holds a key lock, the merge waits for it and re-points it. The check is a
 * function of the catalog (ADR 0003: no SQL on its tables from here).
 */
export async function ensureSpeciesVisible(
  client: { query: (sql: string, values: unknown[]) => Promise<{ rows: { merged: boolean }[] }> },
  speciesId: string,
): Promise<void> {
  const r = await client.query("select species_is_merged($1) as merged", [speciesId]);
  if (r.rows[0]?.merged) throw new SpeciesGone();
}

/**
 * One statement (US-BES-11): only `caught_at` of one specimen of the account changes. On an archived specimen a date
 * after its archiving date changes nothing (`after_archived`); a foreign specimen is invisible to the row rule and
 * looks like an unknown one (`not_found`, P-04). Calendar rules and "not in the future" are checked by the operation.
 */
export async function setCaughtAt(
  pool: Pool,
  userId: string,
  id: string,
  date: string,
): Promise<SpecimenRow | "not_found" | "after_archived"> {
  return withAccount(pool, userId, async (c) => {
    const r = await c.query<SpecimenRow>(
      `update specimen set caught_at = $2::date
        where id = $1 and (archived_at is null or archived_at >= $2::date) returning ${COLUMNS}`,
      [id, date],
    );
    if (r.rows[0]) return r.rows[0];
    const there = await c.query("select 1 from specimen where id = $1", [id]);
    return there.rowCount ? "after_archived" : "not_found";
  });
}

/** A specimen of the marker assignments that is unknown, foreign, archived or already has a marker: the transaction is undone. */
export class UnknownSpecimen extends Error {}

export interface NewSpecimen {
  readonly speciesId: string;
  readonly name: string;
  readonly marker: string | null;
  readonly locationId: string | null;
  readonly caughtAt: string | null;
  readonly status?: "plant" | "cutting";
}

/**
 * Creates a specimen inside the open transaction of `c`, as the account the connection is set to (ADR 0012: the
 * handover of a swap runs this for the recipient in the transaction of the giver's archiving). First the markers of the
 * existing specimens (US-BES-03), then the new specimen; the database decides uniqueness of name and marker. Errors are
 * thrown for the caller to map (`UnknownSpecimen`, `SpeciesGone`, unique and foreign key violations); it never opens
 * or ends a transaction itself.
 */
export async function createSpecimenOn(
  c: PoolClient,
  userId: string,
  w: NewSpecimen,
  assignments: readonly { specimenId: string; name: string; marker: string }[] = [],
): Promise<SpecimenRow> {
  for (const a of assignments) {
    const done = await c.query(
      `update specimen set name = $2, marker = $3 where id = $1 and status <> 'archived' and marker is null`,
      [a.specimenId, a.name, a.marker],
    );
    if (!done.rowCount) throw new UnknownSpecimen();
  }
  const r = await c.query<SpecimenRow>(
    `insert into specimen (account_id, species_id, name, marker, location_id, caught_at, status)
     values ($1, $2, $3, $4, $5, $6, $7) returning ${COLUMNS}`,
    [userId, w.speciesId, w.name, w.marker, w.locationId, w.caughtAt, w.status ?? "plant"],
  );
  await ensureSpeciesVisible(c, w.speciesId);
  return r.rows[0] as SpecimenRow;
}

/**
 * Archives a specimen inside the open transaction of `c` (US-BES-07): status `archived`, date and reason; an archived one
 * is left as it is (`null`), a foreign or unknown one is invisible to the row rule (`null` as well).
 */
export async function archiveSpecimenOn(
  c: PoolClient,
  id: string,
  reason: string,
  date: string,
): Promise<SpecimenRow | null> {
  const r = await c.query<SpecimenRow>(
    `update specimen set status_before_archived = status, status = 'archived', archived_at = $2,
       archived_reason = $3 where id = $1 and status <> 'archived' returning ${COLUMNS}`,
    [id, date, reason],
  );
  return r.rows[0] ?? null;
}

/** The specimens of the account the connection is set to, by name; for the naming rule of a new one (DM-BES-03). */
export async function listSpecimensOn(c: PoolClient): Promise<readonly SpecimenRow[]> {
  const r = await c.query<SpecimenRow>(`select ${COLUMNS} from specimen order by lower(name)`);
  return r.rows;
}

/** One specimen of the account the connection is set to; `null` if there is none (a foreign one is invisible, P-04). */
export async function findSpecimenOn(c: PoolClient, id: string): Promise<SpecimenRow | null> {
  const r = await c.query<SpecimenRow>(`select ${COLUMNS} from specimen where id = $1`, [id]);
  return r.rows[0] ?? null;
}
