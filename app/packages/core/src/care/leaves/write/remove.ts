// Removes a leaf logged by mistake (US-WAC-07, P-03, P-10). The answer names the removed leaf; a leaf that is not there
// (or belongs to another account or plant) is `leaf.not_found`, so nothing else can be told from the answer (P-04).
import {
  appError,
  defineOperation,
  failed,
  idField,
  ok,
  shape,
  type Result,
} from "../../../kernel";
import { LEAF_KEEPER_SWITCH, type LeafStore } from "../types";

export interface LeafRemoveDependencies {
  readonly leaves: Pick<LeafStore, "remove">;
  /** Whether the keeper switched the leaf log off (US-ONB-09); a switched-off leaf log removes nothing. */
  readonly keeperOff: (userId: string) => Promise<boolean>;
}

const schema = shape({
  specimenId: idField("specimenId"),
  leafId: idField("leafId"),
});

/**
 * Removes one leaf of one plant of the keeper (US-WAC-07). The leaf is gone for good: the count and the comparison follow
 * the rest. With the keeper switch off nothing is removed (`onboarding.keeper_off`, P-12).
 */
export const leafRemove = (deps: LeafRemoveDependencies) =>
  defineOperation({
    name: "leaf.remove",
    schema,
    run: async ({ userId }, { specimenId, leafId }): Promise<Result<{ id: string }>> => {
      if (await deps.keeperOff(userId))
        return failed(appError("onboarding.keeper_off", { data: { id: LEAF_KEEPER_SWITCH } }));
      const removed = await deps.leaves.remove(userId, specimenId, leafId);
      return removed ? ok({ id: leafId }) : failed(appError("leaf.not_found"));
    },
  });
