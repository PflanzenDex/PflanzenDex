import type { Pool } from "pg";

/**
 * Species with an active specimen, one row per account and species, for exactly the given accounts (US-POK-14). Not
 * account-scoped on purpose: the checked database function `active_species_of()` answers only for the IDs it gets, and
 * the caller passes the accounts that consented to the rarity in PflanzenDex and turns the rows into counts.
 */
export class ActiveSpeciesPostgres {
  constructor(private readonly pool: Pool) {}

  async activeSpeciesOf(
    accountIds: readonly string[],
  ): Promise<readonly { accountId: string; speciesId: string }[]> {
    if (accountIds.length === 0) return [];
    const r = await this.pool.query<{ accountId: string; speciesId: string }>(
      `select account_id as "accountId", species_id as "speciesId" from active_species_of($1::uuid[])`,
      [accountIds],
    );
    return r.rows;
  }
}
