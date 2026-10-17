import { useEffect, useRef, useState } from "react";
import {
  onboardingSteps,
  type OnboardingCounts,
  type OnboardingStep,
  type OnboardingStepId,
} from "@pflanzendex/core";
import { Button } from "@/components/ui/button/button";
import { LocationsStep, ZonesStep } from "../../light";

const ACTIONS = "flex flex-col gap-3 sm:flex-row";

type Token = () => Promise<string | undefined>;

/** The last step only names the way to the catalog; creating the specimen is the collection's job (US-BES-02). */
function FirstPlantStep(props: { step: OnboardingStep; onChoose: () => void; onSkip: () => void }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 tabIndex={-1} className="text-xl font-semibold">
        Deine erste Pflanze
      </h2>
      <p className="text-sm text-muted-foreground">{props.step.nextAction}</p>
      <div className={ACTIONS}>
        <Button type="button" onClick={props.onChoose}>
          {props.step.actionLabel}
        </Button>
        <Button type="button" variant="secondary" onClick={props.onSkip}>
          Überspringen
        </Button>
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
  onEnd: () => void;
}) {
  const steps = onboardingSteps(props.counts);
  const first = Math.max(
    0,
    steps.findIndex((s) => !s.done),
  );
  const [index, setIndex] = useState(first);
  const id: OnboardingStepId = steps[index]?.id ?? "first_plant";
  const next = () => (index + 1 >= steps.length ? props.onFinish() : setIndex(index + 1));
  // A button that unmounts takes the focus with it: move it to the heading of the new step (not on first render).
  const box = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  useEffect(() => {
    if (moved.current) box.current?.querySelector("h2")?.focus();
    moved.current = true;
  }, [index]);
  const common = { api: props.api, token: props.token, onNext: next };
  return (
    <div className="flex flex-col gap-3" ref={box}>
      <h1 className="text-2xl font-semibold">Start</h1>
      <p
        className="m-0 self-start rounded-full border border-current px-2.5 py-0.5 text-sm font-semibold"
        role="status"
      >{`Schritt ${index + 1} von ${steps.length}: ${steps[index]?.title ?? ""}`}</p>
      {id === "locations" && <LocationsStep {...common} />}
      {id === "zones" && <ZonesStep {...common} />}
      {id === "first_plant" && (
        <FirstPlantStep
          step={steps[2] as OnboardingStep}
          onChoose={props.onChoosePlant}
          onSkip={props.onFinish}
        />
      )}
      <div className={ACTIONS}>
        {index > 0 && (
          <Button type="button" variant="secondary" onClick={() => setIndex(index - 1)}>
            Zurück
          </Button>
        )}
        <Button type="button" variant="secondary" onClick={props.onEnd}>
          Einstieg beenden
        </Button>
      </div>
    </div>
  );
}
