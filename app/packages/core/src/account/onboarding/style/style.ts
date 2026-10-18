// The keeper style of an account (DM-ONB-01, US-ONB-03): `few` ("ein paar Pflanzen pflegen") or `many` ("viel verwalten,
// alles sofort"). It has no level, rank or title (FR-ONB-08). Changing it is a validating operation (P-03). The lock
// state stays derived (NFR-04); the only thing stored beside the style is the unlock date of the functions a switch to
// `many` opens, so they stay open after a switch back (P-10).
import {
  calendarDateField,
  choiceField,
  defineOperation,
  ok,
  shape,
  timeZoneField,
} from "../../../kernel";
import type { ManualUnlockStore } from "../unlock-open";
import type { KeeperStyle } from "../unlock";

export const KEEPER_STYLES: readonly KeeperStyle[] = ["few", "many"];

/** A new account starts with `few`; an account without a row counts as `few` (FR-ONB-06 sets existing accounts to `many`). */
export const DEFAULT_KEEPER_STYLE: KeeperStyle = "few";

/** The stored choice. `chosenOn` is the local calendar date of the last choice; `null` for a style set by the migration. */
export interface KeeperStyleChoice {
  readonly style: KeeperStyle;
  readonly chosenOn: string | null;
}

/** Port for persistence; the adapter lives in `db` (AB-1) and runs as the account of the caller (P-04). */
export interface KeeperStyleStore {
  /** `null` while the account never chose (and was not set by the migration). */
  find(userId: string): Promise<KeeperStyleChoice | null>;
  /** One statement; answers the stored choice. */
  set(userId: string, style: KeeperStyle, chosenOn: string): Promise<KeeperStyleChoice>;
}

/** The style of the account; `few` while nothing was stored. */
export async function readKeeperStyle(
  store: Pick<KeeperStyleStore, "find">,
  userId: string,
): Promise<KeeperStyle> {
  return (await store.find(userId))?.style ?? DEFAULT_KEEPER_STYLE;
}

const schema = shape({
  style: choiceField("style", KEEPER_STYLES),
  on: calendarDateField("on"),
  timeZone: timeZoneField("timeZone"),
});

/**
 * Sets the style (US-ONB-03). Skipping the question stores `few`. Switching from `few` to `many` records the switch date
 * as the unlock date of every function that is locked at that moment; switching back deletes nothing, so what was open
 * stays open (P-10). Repeating the same style changes nothing but the date of the choice.
 */
export const onboardingSetStyle = (deps: {
  styles: KeeperStyleStore;
  unlocks: ManualUnlockStore;
  /** Ids of the functions locked for the account under style `few` today (switched-off ones are not among them). */
  lockedFunctions: (userId: string, timeZone: string) => Promise<readonly string[]>;
}) =>
  defineOperation({
    name: "onboarding.set_style",
    schema,
    run: async ({ userId }, { style, on, timeZone }) => {
      const before = await readKeeperStyle(deps.styles, userId);
      // The locked functions are read before the style changes: under `many` nothing is locked any more.
      if (style === "many" && before === "few")
        for (const id of await deps.lockedFunctions(userId, timeZone))
          await deps.unlocks.add(userId, id, on, "style_many");
      return ok(await deps.styles.set(userId, style, on));
    },
  });
