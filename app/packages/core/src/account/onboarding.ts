/** What the account already has; the onboarding is derived from it live and never stored (US-ACC-03). */
export interface OnboardingCounts {
  readonly specimens: number;
  /** Archived specimens: an account that had plants is a returning keeper, not a new one (#291). */
  readonly archivedSpecimens: number;
}

export type OnboardingStepId = "species" | "save" | "first_plant";

export interface OnboardingStep {
  readonly id: OnboardingStepId;
  readonly title: string;
  /** The label of the button that does it; the only place that spells it. */
  readonly actionLabel: string;
  /** P-09: every view says what to do next. */
  readonly nextAction: string;
}

/** Locations and light zones are not asked before the first plant; the first plant has at most this many steps (US-ONB-01). */
export const FIRST_PLANT_STEPS: readonly OnboardingStep[] = [
  {
    id: "species",
    title: "Art wählen",
    actionLabel: "Weiter",
    nextAction: "Tippe den Namen deiner Pflanze, wir suchen die Art.",
  },
  {
    id: "save",
    title: "Pflanze speichern",
    actionLabel: "Pflanze speichern",
    nextAction: "Der Lichtbedarf kommt von der Art. Du kannst ihn ändern.",
  },
];

/** The start page's one action without a plant: choose the species, which leads to the first plant (P-09). */
const FIRST_PLANT: OnboardingStep = {
  id: "first_plant",
  title: "Deine erste Pflanze",
  actionLabel: "Art im Katalog wählen",
  nextAction: "Wähle im Katalog eine Art und lege dein erstes Exemplar an.",
};

/** The guide is for new accounts only: no active and no archived plant (an account with only archived ones returns). */
export function isNewAccount(c: OnboardingCounts): boolean {
  return c.specimens === 0 && c.archivedSpecimens === 0;
}

/**
 * Without an active plant the start page names one clear next action (P-09): the first plant for a new account, the
 * next plant for a returning keeper whose plants are all archived. With a plant: none.
 */
export function startAction(c: OnboardingCounts): OnboardingStep | null {
  if (c.specimens > 0) return null;
  if (isNewAccount(c)) return FIRST_PLANT;
  return {
    ...FIRST_PLANT,
    title: "Nächste Pflanze",
    nextAction:
      "Deine bisherigen Pflanzen sind archiviert. Wähle im Katalog eine Art für deine nächste Pflanze.",
  };
}
