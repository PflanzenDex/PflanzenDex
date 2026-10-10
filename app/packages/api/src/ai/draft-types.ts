import {
  appError,
  execute,
  failed,
  speciesPropose,
  wishCreate,
  type DraftTypes,
} from "@pflanzendex/core";
import { IdempotencyPostgres, SpeciesPostgres, WishesPostgres } from "@pflanzendex/db";
import type { Pool } from "pg";

/**
 * The kinds of draft the AI interface accepts (KI-R3). Each one names the validating operation of the form that checks
 * the content when it is delivered and runs again when the keeper adopts it (KI-R1, P-03). Later stories add the species
 * profile (US-KI-03) and the photo assessment (US-KI-04).
 * - `species`: a species profile with all required fields of DM-BES-01 and a mandatory source (US-KI-03), adopted through
 *   `species.propose` like the form, so it starts as a proposal that only a reviewer approves (FR-BES-06, FR-KI-09).
 * - `wish`: a wish candidate (US-KI-05, US-WUN-04), adopted through `wish.create` like the wishlist form.
 */
export function draftTypes(pool: Pool): DraftTypes {
  const wishes = new WishesPostgres(pool);
  const writes = { idempotency: new IdempotencyPostgres(pool) };
  const create = wishCreate({ wishes });
  const propose = speciesPropose(new SpeciesPostgres(pool));
  return {
    species: {
      // Incomplete profiles are not stored: the schema of the form decides; statements need a source (US-KI-03).
      schema: (input) => {
        const r = propose.schema(input);
        return r.ok && !r.value.source
          ? failed(
              appError("input.invalid", { details: [{ field: "source", code: "input.invalid" }] }),
            )
          : r;
      },
      adopt: (userId, content, key) =>
        execute(propose, writes, { context: { userId }, input: content, idempotencyKey: key }),
    },
    wish: {
      schema: create.schema,
      adopt: (userId, content, key) =>
        execute(create, writes, { context: { userId }, input: content, idempotencyKey: key }),
    },
  };
}
