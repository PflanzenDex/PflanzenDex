// Same shapes as the interfaces in `core` (structurally equal; `db` does not import `core`).
export interface SpecimenRow {
  readonly id: string;
  readonly speciesId: string;
  readonly name: string;
  readonly marker: string | null;
  readonly locationId: string | null;
  readonly status: "plant" | "cutting" | "archived";
  readonly caughtAt: string | null;
  readonly archivedAt: string | null;
  readonly archivedReason: string | null;
}

// `date` comes back as text: the driver would turn it into a `Date` in the server's time zone (NFR-08).
export const COLUMNS = `id, species_id as "speciesId", name, marker, location_id as "locationId", status,
  to_char(caught_at, 'YYYY-MM-DD') as "caughtAt", to_char(archived_at, 'YYYY-MM-DD') as "archivedAt",
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
