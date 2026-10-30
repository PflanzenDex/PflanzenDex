import type { Pool } from "pg";
import { withAccount } from "../../kernel/index.ts";

/** Same shape as `IntroductionRaw` in `core` (structurally equal; `db` does not import `core`). */
interface IntroductionRaw {
  readonly accounts: number | null;
  readonly settled: number | null;
  readonly settledWithoutPlant: number | null;
  readonly withPlant: number | null;
  readonly medianSeconds: number | null;
}

/**
 * The figures of the introduction for the operator (US-ONB-08): counts and one median from the creation instants of
 * accounts and their first specimen. The function runs under the account of the caller and checks the operator role in
 * the database (P-04); nothing about an individual leaves it (P-05), and a count below 5 accounts is `null` already
 * in SQL.
 */
export class IntroductionPostgres {
  constructor(private readonly pool: Pool) {}

  async figures(userId: string, windowDays: number, settleDays: number): Promise<IntroductionRaw> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<IntroductionRaw>(
        `select accounts, settled, settled_without_plant as "settledWithoutPlant",
                with_plant as "withPlant", median_seconds as "medianSeconds"
           from operator_introduction($1, $2)`,
        [windowDays, settleDays],
      ),
    );
    return r.rows[0] as IntroductionRaw;
  }
}
