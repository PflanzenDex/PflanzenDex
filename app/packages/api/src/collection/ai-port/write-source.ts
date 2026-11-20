import {
  execute,
  type Operation,
  type SpecimenWriteSource,
  type WriteRunner,
} from "@pflanzendex/core";
import { IdempotencyPostgres } from "@pflanzendex/db";
import type { Pool } from "pg";
import { specimenOperations, type SpecimenOperationOptions } from "../markers/specimen-operations";

/** An operation bound to the idempotency store, exactly as the route helper `write` runs it (P-03). */
function runnerOf<E, A>(op: Operation<E, A>, pool: Pool): WriteRunner {
  const deps = { idempotency: new IdempotencyPostgres(pool) };
  return {
    name: op.name,
    schema: op.schema,
    run: (userId, input, key) =>
      execute(op, deps, { context: { userId }, input, idempotencyKey: key }),
  };
}

/**
 * The write tools of the specimens (US-KI-14) over the operations the app's specimen routes run (KI-R10, FR-KI-14):
 * the same factory with the same options, so no tool has a code path of its own.
 */
export function collectionWriteSourceFor(
  pool: Pool,
  opt: SpecimenOperationOptions = {},
): SpecimenWriteSource {
  const ops = specimenOperations(pool, opt);
  return {
    create_specimen: runnerOf(ops.create, pool),
    set_specimen_marker: runnerOf(ops.mark, pool),
    correct_catch_date: runnerOf(ops.correctCatchDate, pool),
    set_specimen_location: runnerOf(ops.setLocation, pool),
    set_specimen_light_zone: runnerOf(ops.setLightZone, pool),
    repot_specimen: runnerOf(ops.repot, pool),
    restore_specimen: runnerOf(ops.restore, pool),
  };
}
