import type { Pool } from "pg";
import { withAccount } from "../kernel/index.ts";
import { COLUMNS, type WishRow } from "./wish-row.ts";

// The shapes are the types of `core` (type-only import through its public entry, AB-2).
import type { DecisionStore, DiscoverDecision, WishSource, WishStatus } from "@pflanzendex/core";

/**
 * Adapter of the port `DecisionStore` (undo, US-ENT-04). Every call runs as the account of the caller under the row
 * rules (P-04, P-05); a foreign wish looks like an unknown one.
 */
export class DecisionsPostgres implements DecisionStore {
  constructor(private readonly pool: Pool) {}

  /** The wish of the name key with its source and its mark as the last Yes or No; `null` when there is none. */
  async decisionOf(userId: string, nameKey: string): Promise<DiscoverDecision | null> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<WishRow & { source: WishSource; lastDecision: "yes" | "no" | null }>(
        `select ${COLUMNS}, source, last_decision as "lastDecision" from wish where name_key = $1 and type = 'plant'`,
        [nameKey],
      ),
    );
    const row = r.rows[0];
    if (!row) return null;
    const { source, lastDecision, ...wish } = row;
    return { wish, source, decision: lastDecision };
  }

  /**
   * Removes the wish of the last Yes or No in one statement that matches only that decision: the mark, the status the
   * decision gave, a Discover source and no specimen (US-ENT-04). When nothing matches, the answer says why: `not_found`
   * (no such wish of the account), `not_last` (the mark moved to another wish) or `changed` (the wish changed since).
   */
  async takeBackDecision(
    userId: string,
    take: { wishId: string; decision: "yes" | "no"; status: WishStatus },
  ): Promise<WishRow | "not_found" | "not_last" | "changed"> {
    return withAccount(this.pool, userId, async (c) => {
      const gone = await c.query<WishRow>(
        `delete from wish where id = $1 and type = 'plant' and source = 'discover' and last_decision = $2 and status = $3 and specimen_id is null returning ${COLUMNS}`,
        [take.wishId, take.decision, take.status],
      );
      if (gone.rows[0]) return gone.rows[0];
      const seen = await c.query<{ lastDecision: string | null }>(
        `select last_decision as "lastDecision" from wish where id = $1`,
        [take.wishId],
      );
      const found = seen.rows[0];
      if (!found) return "not_found";
      return found.lastDecision === take.decision ? "changed" : "not_last";
    });
  }
}
