// The keeper's switches in the interface (US-ONB-09, P-12). A switch the keeper turned off reads as an off feature for the
// interface: it leaves navigation, "Heute" and the sections of the app, exactly as a function the operator switched off.
// The data stays and is never deleted (P-10); the server answers the same data. Derived from the lock states the API sends,
// so a write refreshes it at once (no reload).
import { useMemo, type ReactNode } from "react";
import { FeaturesProvider, type FeatureStates } from "@/shared/data";
import type { UnlockEntry } from "../unlock-api";
import { useUnlocks } from "../unlocks/unlocks";

/** The keeper switches that are off: a function in state `keeper_off` names its switch (US-ONB-09). */
export function keeperSwitchesOff(entries: readonly UnlockEntry[]): ReadonlySet<string> {
  return new Set(
    entries.flatMap((e) => (e.state === "keeper_off" && e.keeperSwitch ? [e.keeperSwitch] : [])),
  );
}

/**
 * The features the account may use in the interface: the operator's switches and the keeper's, together. Unknown counts as
 * on (no state sent): only an explicit off hides, and no error of the lock states hides anything (P-10).
 */
export function withKeeperSwitches(
  features: FeatureStates | undefined,
  off: ReadonlySet<string>,
): FeatureStates {
  return {
    ...features,
    social: features?.social !== false && !off.has("friends"),
    ai: features?.ai !== false && !off.has("ai_access"),
    wishlist: !off.has("wishlist"),
    discover: !off.has("discover"),
    equipment: !off.has("equipment"),
    achievement_views: !off.has("achievement_views"),
  };
}

/**
 * The features of the signed-in account for the interface: the operator's switches and the keeper's switches (US-ONB-09)
 * together. A keeper-off feature leaves the navigation and "Heute" at once, because the provider follows the lock states.
 */
export function SignedInFeatures(props: {
  features: FeatureStates | undefined;
  children: ReactNode;
}) {
  const entries = useUnlocks().entries;
  const features = useMemo(
    () => withKeeperSwitches(props.features, keeperSwitchesOff(entries)),
    [props.features, entries],
  );
  return <FeaturesProvider features={features}>{props.children}</FeaturesProvider>;
}
