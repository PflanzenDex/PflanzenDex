import type { Pool } from "pg";
import { withAccount } from "../kernel/index.ts";

/** Adapter for the per-account feature switches (US-DEV-06): reads the own rows only, writing is the operator's job. */
export class AccountFeaturesPostgres {
  constructor(private readonly pool: Pool) {}

  /** The names of the functions the operator opened for this account (P-04: no other account's rows are visible). */
  async find(userId: string): Promise<readonly string[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<{ feature: string }>("select features_of_account() as feature"),
    );
    return r.rows.map((z) => z.feature);
  }
}
