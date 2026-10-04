/** What the account already has; the onboarding is derived from it live and never stored (US-ACC-03). */
export interface OnboardingCounts {
  readonly locations: number;
  readonly zones: number;
  readonly specimens: number;
}

export type OnboardingStepId = "locations" | "zones" | "first_plant";

export interface OnboardingStep {
  readonly id: OnboardingStepId;
  readonly done: boolean;
  readonly title: string;
  /** The label of the button that does it; the only place that spells it. */
  readonly actionLabel: string;
  /** P-09: every view says what to do next. */
  readonly nextAction: string;
}

export interface OnboardingHint {
  readonly id: "locations" | "zones";
  readonly text: string;
  readonly actionLabel: string;
  readonly nextAction: string;
}

/** The three questions of the onboarding, in order. Every step can be skipped; "done" only says the account has data. */
export function onboardingSteps(c: OnboardingCounts): readonly OnboardingStep[] {
  return [
    {
      id: "locations",
      done: c.locations > 0,
      title: "Standorte",
      actionLabel: "Standorte anlegen",
      nextAction: "Lege an, wo deine Pflanzen stehen, zum Beispiel Fensterbank oder Balkon.",
    },
    {
      id: "zones",
      done: c.zones > 0,
      title: "Lichtzonen",
      actionLabel: "Lichtzonen einrichten",
      nextAction: "Übernimm die vier Standardstufen oder passe sie später an.",
    },
    {
      id: "first_plant",
      done: c.specimens > 0,
      title: "Erste Pflanze",
      actionLabel: "Art im Katalog wählen",
      nextAction: "Wähle im Katalog eine Art und lege dein erstes Exemplar an.",
    },
  ];
}

/** Without a plant the start page names the first plant as the one clear next action; with a plant: none. */
export function startAction(c: OnboardingCounts): OnboardingStep | null {
  if (c.specimens > 0) return null;
  return onboardingSteps(c).find((s) => s.id === "first_plant") ?? null;
}

const HINT_TEXT = {
  locations: "Du hast noch keinen Standort angelegt.",
  zones: "Du hast noch keine Lichtzonen.",
} as const;

/** Details skipped in the onboarding show up later as a hint (US-ACC-03), never as an error. */
export function onboardingHints(c: OnboardingCounts): readonly OnboardingHint[] {
  return onboardingSteps(c).flatMap((s) =>
    !s.done && (s.id === "locations" || s.id === "zones")
      ? [
          {
            id: s.id,
            text: HINT_TEXT[s.id],
            actionLabel: s.actionLabel,
            nextAction: s.nextAction,
          },
        ]
      : [],
  );
}
