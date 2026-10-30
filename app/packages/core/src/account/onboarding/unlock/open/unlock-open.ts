// The keeper opens a staged function by tap (US-ONB-05, DM-ONB-02): the only write of the unlock rules. It stores the
// decision, never the lock state (NFR-04). A lock is no permission (FR-ONB-04), so any function may be opened at any time;
// a function the operator switched off is not known to the keeper and cannot be opened (FR-ONB-03).
import {
  appError,
  calendarDateField,
  defineOperation,
  failed,
  ok,
  shape,
  textField,
  type FeatureSet,
} from "../../../../kernel";
import { UNLOCK_FUNCTIONS } from "../unlock-registry";

export interface ManualUnlock {
  readonly id: string;
  /** Local calendar date of the tap (NFR-08). */
  readonly unlockedOn: string;
}

/** Port for persistence; the adapter lives in `db` and runs as the account of the caller (P-04). Rows are never deleted. */
export interface ManualUnlockStore {
  list(userId: string): Promise<readonly ManualUnlock[]>;
  /** Stores the unlock once; a function that is already open keeps its first date. Returns the stored row. */
  add(
    userId: string,
    id: string,
    unlockedOn: string,
    source?: "tap" | "style_many",
  ): Promise<ManualUnlock>;
}

const schema = shape({ id: textField("id", { min: 1, max: 40 }), on: calendarDateField("on") });

/** Opens one function for good ("Jetzt freischalten"); repeating it changes nothing. Unknown or switched-off: refused. */
export const onboardingUnlockFunction = (deps: {
  unlocks: ManualUnlockStore;
  features: (userId: string) => Promise<FeatureSet>;
}) =>
  defineOperation({
    name: "onboarding.unlock_function",
    schema,
    run: async ({ userId }, { id, on }) => {
      const found = UNLOCK_FUNCTIONS.find((f) => f.id === id);
      const switchedOff = found?.feature && !(await deps.features(userId)).has(found.feature);
      if (!found || switchedOff)
        return failed(appError("onboarding.unknown_function", { data: { id } }));
      return ok(await deps.unlocks.add(userId, id, on));
    },
  });
