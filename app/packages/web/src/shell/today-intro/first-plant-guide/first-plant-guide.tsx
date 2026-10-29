import type { QueryKey } from "@tanstack/react-query";
import { useInvalidate } from "../../../kernel";
import { OnboardingWizard } from "../../onboarding-wizard/onboarding-wizard";
import type { SpeciesLookup } from "../../onboarding-wizard/species-step/species-step";
import type { LinkTarget } from "../../../components/shared/navigation/nav-model/navigation/navigation";

/** The guide of a new account (US-ONB-01) in place of the day's tasks. */
export function FirstPlantGuide(props: {
  lookup: SpeciesLookup;
  api: string;
  token: () => Promise<string | undefined>;
  /** The query of the counts: saving the plant refreshes it. */
  counts: QueryKey;
  onOpen: (t: Extract<LinkTarget, "species" | "collection">) => void;
  onLeave: () => void;
}) {
  const refresh = useInvalidate(props.counts);
  return (
    <OnboardingWizard
      lookup={props.lookup}
      api={props.api}
      token={props.token}
      onChoosePlant={() => props.onOpen("species")}
      onSkip={props.onLeave}
      onCreated={() => {
        props.onLeave();
        refresh();
        props.onOpen("collection");
      }}
    />
  );
}
