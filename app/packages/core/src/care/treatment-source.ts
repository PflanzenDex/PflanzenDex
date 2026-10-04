import type { TreatmentSource } from "../collection";
import type { TreatmentStore } from "./treatment-types";

export interface TreatmentSourceDependencies {
  readonly treatments: Pick<TreatmentStore, "open">;
}

/** Placeholder: implemented after the red tests. */
export function treatmentSource(deps: TreatmentSourceDependencies): TreatmentSource {
  void deps;
  return { open: async () => new Map() };
}
