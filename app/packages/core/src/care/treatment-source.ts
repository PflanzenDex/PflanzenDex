import type { OpenTreatment, TreatmentSource } from "../collection";
import type { TreatmentStore } from "./treatment-types";

export interface TreatmentSourceDependencies {
  readonly treatments: Pick<TreatmentStore, "open">;
}

/**
 * Implements the port "Open treatments per specimen" of `collection` (US-BES-06, US-BEH-01): the open treatments of the
 * named specimens of the account, with reason and due date; a specimen without an open treatment is missing from the
 * answer. Done treatments never appear; without IDs the store is not asked.
 */
export function treatmentSource(deps: TreatmentSourceDependencies): TreatmentSource {
  return {
    async open(userId, specimenIds) {
      const result = new Map<string, readonly OpenTreatment[]>();
      if (specimenIds.length === 0) return result;
      for (const [id, rows] of await deps.treatments.open(userId, specimenIds))
        result.set(
          id,
          rows.map(({ id: treatmentId, reason, dueAt }) => ({ id: treatmentId, reason, dueAt })),
        );
      return result;
    },
  };
}
