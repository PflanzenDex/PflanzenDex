import { execute, wishCreate, type DraftTypes } from "@pflanzendex/core";
import { IdempotencyPostgres, WishesPostgres } from "@pflanzendex/db";
import type { Pool } from "pg";

/**
 * The kinds of draft the AI interface accepts (KI-R3). Each one names the validating operation of the form that checks
 * the content when it is delivered and runs again when the keeper adopts it (KI-R1, P-03). Later stories add the species
 * profile (US-KI-03) and the photo assessment (US-KI-04).
 * - `wish`: a wish candidate (US-KI-05, US-WUN-04), adopted through `wish.create` like the wishlist form.
 */
export function draftTypes(pool: Pool): DraftTypes {
  const wishes = new WishesPostgres(pool);
  const writes = { idempotency: new IdempotencyPostgres(pool) };
  const create = wishCreate({ wishes });
  return {
    wish: {
      schema: create.schema,
      adopt: (userId, content, key) =>
        execute(create, writes, { context: { userId }, input: content, idempotencyKey: key }),
    },
  };
}
