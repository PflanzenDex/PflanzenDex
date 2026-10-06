import type { Pool } from "pg";
import { withAccount } from "../kernel/index.ts";

/**
 * Adapter for the seen state of the Pokédex (US-POK-12); every call runs as the account of the caller under the row
 * rule (P-04): the statements carry no account ID for reading, the rule alone decides which row they see.
 */
export class PokedexStatePostgres {
  constructor(private readonly pool: Pool) {}

  /** The seen species keys; `null` while the account has no row yet. */
  async find(userId: string): Promise<string[] | null> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<{ seen: string[] }>("select seen_species as seen from pokedex_state"),
    );
    return r.rows[0]?.seen ?? null;
  }

  /** Adds the keys, creating the row when missing, in one statement; answers the whole state. No key is stored twice. */
  async add(userId: string, species: readonly string[]): Promise<string[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<{ seen: string[] }>(
        `insert into pokedex_state (account_id, seen_species)
         values ($2, array(select distinct unnest($1::text[])))
         on conflict (account_id) do update
           set seen_species = array(select distinct unnest(pokedex_state.seen_species || excluded.seen_species)),
               updated_at = now()
         returning seen_species as seen`,
        [species, userId],
      ),
    );
    return r.rows[0]?.seen ?? [];
  }
}
