import { useState } from "react";
import { onboardingSteps, type OnboardingCounts, type OnboardingStepId } from "@pflanzendex/core";
import { LocationsStep, ZonesStep } from "./light";

type Token = () => Promise<string | undefined>;

/** The last step only names the way to the catalog; creating the specimen is the collection's job (US-BES-02). */
function FirstPlantStep(props: { onChoose: () => void; onSkip: () => void }) {
  const text = onboardingSteps({ locations: 0, zones: 0, specimens: 0 }).find(
    (s) => s.id === "first_plant",
  )?.nextAction;
  return (
    <section className="onboarding-step">
      <h2>Deine erste Pflanze</h2>
      <p className="quiet">{text}</p>
      <div className="actions">
        <button type="button" className="primary" onClick={props.onChoose}>
          Art im Katalog wählen
        </button>
        <button type="button" className="secondary" onClick={props.onSkip}>
          Überspringen
        </button>
      </div>
    </section>
  );
}

/**
 * Guided onboarding (US-ACC-03): locations, light zones, first plant. Every step can be skipped. It starts at the first
 * step the account has no data for, so a returning account never repeats what it already did.
 */
export function OnboardingWizard(props: {
  api: string;
  token: Token;
  counts: OnboardingCounts;
  onChoosePlant: () => void;
  onFinish: () => void;
  onLater: () => void;
}) {
  const steps = onboardingSteps(props.counts);
  const first = Math.max(
    0,
    steps.findIndex((s) => !s.done),
  );
  const [index, setIndex] = useState(first);
  const id: OnboardingStepId = steps[index]?.id ?? "first_plant";
  const next = () => (index + 1 >= steps.length ? props.onFinish() : setIndex(index + 1));
  const common = { api: props.api, token: props.token, onNext: next };
  return (
    <div className="onboarding">
      <p className="onboarding-progress">{`Schritt ${index + 1} von ${steps.length}`}</p>
      {id === "locations" && <LocationsStep {...common} />}
      {id === "zones" && <ZonesStep {...common} />}
      {id === "first_plant" && (
        <FirstPlantStep onChoose={props.onChoosePlant} onSkip={props.onFinish} />
      )}
      <div className="actions">
        <button type="button" className="secondary" onClick={props.onLater}>
          Einstieg später fortsetzen
        </button>
      </div>
    </div>
  );
}
