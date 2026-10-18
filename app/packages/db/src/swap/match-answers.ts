import type { Pool } from "pg";
import { withAccount } from "../kernel/index.ts";

// Same shape as the interface in `core` (structurally equal; `db` does not import `core`).
export interface MatchAnswerRow {
  readonly offerId: string;
  readonly answer: "no" | "later";
  /** Local calendar date `YYYY-MM-DD` of the keeper (NFR-08). */
  readonly answeredOn: string;
}

const COLUMNS = `offer_id as "offerId", answer, to_char(answered_on, 'YYYY-MM-DD') as "answeredOn"`;

/**
 * Adapter for the private answers No and Later (US-TAU-02, DM-TAU-01). Every call runs as the account of the caller under
 * the row rule (P-04, P-05): the answers of another account do not exist for it, and no query reads across accounts.
 */
export class MatchAnswersPostgres {
  constructor(private readonly pool: Pool) {}

  /** The caller's answers, oldest first. */
  async list(userId: string): Promise<readonly MatchAnswerRow[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<MatchAnswerRow>(
        `select ${COLUMNS} from swap_match_answer order by answered_on, created_at, offer_id`,
      ),
    );
    return r.rows;
  }

  /** Stores or replaces the answer to an offer (one per offer). */
  async save(
    userId: string,
    v: {
      offerId: string;
      answer: "no" | "later";
      answeredOn: string;
      speciesLatin: string | null;
      speciesGerman: string | null;
      giverName: string | null;
    },
  ): Promise<void> {
    await withAccount(this.pool, userId, (c) =>
      c.query(
        `insert into swap_match_answer (account_id, offer_id, answer, answered_on, species_latin, species_german, giver_name)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (account_id, offer_id) do update
           set answer = excluded.answer, answered_on = excluded.answered_on, reconsider_at = null,
               species_latin = excluded.species_latin, species_german = excluded.species_german,
               giver_name = excluded.giver_name, updated_at = now()`,
        [userId, v.offerId, v.answer, v.answeredOn, v.speciesLatin, v.speciesGerman, v.giverName],
      ),
    );
  }

  /** Takes the answer back; true when there was one. */
  async remove(userId: string, offerId: string): Promise<boolean> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query("delete from swap_match_answer where offer_id = $1", [offerId]),
    );
    return (r.rowCount ?? 0) > 0;
  }
}
