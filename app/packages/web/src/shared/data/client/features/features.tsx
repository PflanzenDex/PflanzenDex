import { createContext, useContext, type ReactNode } from "react";

/**
 * The function groups as the interface reads them: the operator's switches as the API sends them, and further switches the
 * app adds for the signed-in account (US-ONB-09, the keeper's switches, see `withKeeperSwitches`). A name that is not in
 * here counts as on.
 */
export type FeatureStates = Partial<Record<string, boolean>>;

const FeaturesContext = createContext<FeatureStates | undefined>(undefined);

/** Provides the state from `GET /account`; the app root wraps the signed-in shell with it. */
export function FeaturesProvider(props: {
  features: FeatureStates | undefined;
  children: ReactNode;
}) {
  return (
    <FeaturesContext.Provider value={props.features}>{props.children}</FeaturesContext.Provider>
  );
}

/** Whether a function group is on. Unknown (no state sent, no provider) counts as on, so only an explicit "off" hides. */
export function useFeature(name: string): boolean {
  return useContext(FeaturesContext)?.[name] !== false;
}

/** The whole state of the function groups, or undefined without a provider (several names at once). */
export function useFeatures(): FeatureStates | undefined {
  return useContext(FeaturesContext);
}
