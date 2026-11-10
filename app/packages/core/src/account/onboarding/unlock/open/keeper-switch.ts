// The keeper switch of a feature outside the core purpose (US-ONB-09, P-12): the keeper leaves a feature out, its data
// stays. It is a third state beside the operator's switch (US-DEV-06) and the lock (US-ONB-05); the three never mix, and
// an unlock never switches a feature on. The lock state itself is derived (NFR-04); only the keeper's choice is stored.
import {
  appError,
  calendarDateField,
  defineOperation,
  described,
  failed,
  ok,
  shape,
  textField,
  type ErrorDetail,
} from "../../../../kernel";
import { isCoreFunctionId, isKeeperSwitchId, type KeeperSwitchId } from "../unlock-registry";

/** The stored switch of one feature: `enabled` false is off; `changedOn` is the local date of the last change. */
export interface KeeperSwitchRow {
  readonly feature: KeeperSwitchId;
  readonly enabled: boolean;
  readonly changedOn: string;
}

/**
 * Port for persistence; the adapter lives in `db` and runs as the account of the caller (P-04). A feature without a row is
 * on. `set` answers the stored row; the date changes only when the state changes.
 */
export interface KeeperSwitchStore {
  list(userId: string): Promise<readonly KeeperSwitchRow[]>;
  set(
    userId: string,
    feature: KeeperSwitchId,
    enabled: boolean,
    on: string,
  ): Promise<KeeperSwitchRow>;
}

/** The keeper switches that are off, as the lock states read them (`keeperOff` of UnlockInput). */
export const keeperOffOf = (rows: readonly KeeperSwitchRow[]): ReadonlySet<string> =>
  new Set(rows.filter((r) => !r.enabled).map((r) => r.feature));

const enabledField = described(
  (value: unknown): boolean | ErrorDetail =>
    typeof value === "boolean" ? value : { field: "enabled", code: "input.invalid" },
  { type: "boolean" },
);

const schema = shape({
  feature: textField("feature", { min: 1, max: 40 }),
  enabled: enabledField,
  on: calendarDateField("on"),
});

/**
 * Switches a keeper feature on or off (`account.switch_feature`, P-03). A core feature has no switch and is refused with
 * `onboarding.core_feature`; an unknown id with `onboarding.unknown_function`. Nothing is deleted, so switching on again
 * shows all data (P-10).
 */
export const accountSwitchFeature = (deps: { switches: KeeperSwitchStore }) =>
  defineOperation({
    name: "account.switch_feature",
    schema,
    run: async ({ userId }, { feature, enabled, on }) => {
      if (!isKeeperSwitchId(feature)) {
        return failed(
          appError(
            isCoreFunctionId(feature) ? "onboarding.core_feature" : "onboarding.unknown_function",
            { data: { id: feature } },
          ),
        );
      }
      return ok(await deps.switches.set(userId, feature, enabled, on));
    },
  });
