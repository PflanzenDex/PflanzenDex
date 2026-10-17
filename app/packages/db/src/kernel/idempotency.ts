import type { Pool } from "pg";
import { withAccount } from "./tenant.ts";

// The shapes are the types of `core` (type-only import through its public entry, AB-2).
import type { Begin, IdempotencyKey } from "@pflanzendex/core";
export type { Begin, IdempotencyKey };

type Row = { fingerprint: string; result: unknown; done: boolean };

/**
 * Repeat guard in PostgreSQL. `begin` is atomic: the primary key (account, operation, key) lets exactly one of
 * concurrent calls through as `new`. Entries older than 24 hours (assumption) count as free.
 */
export class IdempotencyPostgres {
  constructor(private readonly pool: Pool) {}

  async begin(s: IdempotencyKey, fingerprint: string): Promise<Begin> {
    return withAccount(this.pool, s.userId, async (c) => {
      await c.query(
        `delete from idempotency where operation = $1 and key = $2 and created_at < now() - interval '24 hours'`,
        [s.operation, s.key],
      );
      const fresh = await c.query(
        `insert into idempotency (account_id, operation, key, fingerprint) values ($1, $2, $3, $4)
         on conflict do nothing`,
        [s.userId, s.operation, s.key, fingerprint],
      );
      if (fresh.rowCount === 1) return { kind: "fresh" };
      const r = await c.query<Row>(
        `select fingerprint, result, done from idempotency where operation = $1 and key = $2`,
        [s.operation, s.key],
      );
      const z = r.rows[0] as Row;
      if (z.fingerprint !== fingerprint) return { kind: "conflict" };
      return z.done ? { kind: "repeat", result: z.result } : { kind: "running" };
    });
  }

  async complete(s: IdempotencyKey, result: unknown): Promise<void> {
    await withAccount(this.pool, s.userId, (c) =>
      c.query(`update idempotency set result = $3, done = true where operation = $1 and key = $2`, [
        s.operation,
        s.key,
        JSON.stringify(result),
      ]),
    );
  }

  async discard(s: IdempotencyKey): Promise<void> {
    await withAccount(this.pool, s.userId, (c) =>
      c.query(`delete from idempotency where operation = $1 and key = $2`, [s.operation, s.key]),
    );
  }
}
