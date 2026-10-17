import { createContext, useContext, type ReactNode } from "react";

/** Which function groups are switched on for the signed-in account (US-DEV-06); the API sends the effective state. */
export type Features = { social: boolean; ai: boolean; recommendations: boolean };
type FeatureName = keyof Features;

const FeaturesContext = createContext<Partial<Features> | undefined>(undefined);

/** Provides the state from `GET /account`; the app root wraps the signed-in shell with it. */
export function FeaturesProvider(props: {
  features: Partial<Features> | undefined;
  children: ReactNode;
}) {
  return (
    <FeaturesContext.Provider value={props.features}>{props.children}</FeaturesContext.Provider>
  );
}

/** Whether a function group is on. Unknown (no state sent, no provider) counts as on, so only an explicit "off" hides. */
export function useFeature(name: FeatureName): boolean {
  return useContext(FeaturesContext)?.[name] !== false;
}
