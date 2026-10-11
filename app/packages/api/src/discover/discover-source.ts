import { execute, suggestions, type DiscoverSource, type ZoneStockSource } from "@pflanzendex/core";
import { IdempotencyPostgres } from "@pflanzendex/db";
import type { Pool } from "pg";
import { zoneStockFor } from "../zone-stock";
import { discoverDependencies } from "./discover-routes";

/** The suggestions and the decision of Discover for the AI interface (US-ENT-08): the same code as the view. */
export function discoverSourceFor(
  pool: Pool,
  stock: ZoneStockSource = zoneStockFor(pool),
): DiscoverSource {
  const { deps, decide } = discoverDependencies(pool, stock);
  const writes = { idempotency: new IdempotencyPostgres(pool) };
  return {
    suggestions: (userId, timeZone, options) => suggestions(deps, userId, timeZone, options),
    schema: decide.schema,
    decide: (userId, input, key) =>
      execute(decide, writes, { context: { userId }, input, idempotencyKey: key }),
  };
}
