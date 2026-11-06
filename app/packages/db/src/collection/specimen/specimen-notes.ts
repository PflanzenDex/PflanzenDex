import type { Pool } from "pg";
import { withAccount } from "../../kernel/index.ts";

// Same shape as the interface in `core` (structurally equal; `db` does not import `core`).
/** The private notes of one specimen (US-BES-18). */
export interface SpecimenNotes {
  readonly id: string;
  readonly notes: string | null;
}

/**
 * Adapter for the private notes (US-BES-18, P-05), the port `NotesStore` of `core`. Every call runs as the account of the
 * caller under the row rules (P-04). Only these two methods read or write the column: the other reads of a specimen select
 * `COLUMNS` (`specimen-shared.ts`), which leaves it out, so no friend view, feed, swap card or AI read carries the notes.
 */
export class SpecimenNotesPostgres {
  constructor(private readonly pool: Pool) {}

  /** The keeper's own notes; `null` for a foreign or unknown specimen, which the row rule hides (P-04). */
  async findNotes(userId: string, id: string): Promise<SpecimenNotes | null> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<SpecimenNotes>(`select id, notes from specimen where id = $1`, [id]),
    );
    return r.rows[0] ?? null;
  }

  /**
   * One statement (US-BES-18): sets or clears the notes of one active specimen. An archived specimen stays unchanged
   * (`archived`, US-BES-07); a foreign or unknown one is invisible to the row rule and answers `not_found` (P-04).
   */
  async setNotes(
    userId: string,
    id: string,
    notes: string | null,
  ): Promise<SpecimenNotes | "not_found" | "archived"> {
    return withAccount(this.pool, userId, async (c) => {
      const r = await c.query<SpecimenNotes>(
        `update specimen set notes = $2 where id = $1 and status <> 'archived' returning id, notes`,
        [id, notes],
      );
      if (r.rows[0]) return r.rows[0];
      const there = await c.query("select 1 from specimen where id = $1", [id]);
      return there.rowCount ? "archived" : "not_found";
    });
  }
}
