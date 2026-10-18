// The figures of the introduction for the operator (US-ONB-08, P-05, NFR-10): read from data that exists (when an
// account was created, when its first specimen was created), aggregated, no tracking of individuals and no event log.
// All thresholds are starting values (assumptions, decided by the PO, P-08); a figure with too few accounts behind it is
// unknown and says why, never a number that would point at a single person.
import { appError, failed, ok, type Result } from "../../kernel";
import { isOperator, type AccessStore } from "../access";
import { FIRST_PLANT_STEPS } from "../onboarding";

/** Accounts created within this many days count (assumption, starting value): the figures follow the current flow. */
export const INTRODUCTION_WINDOW_DAYS = 90;
/** An account is "settled" once it is this old; only then does a missing plant count (the target says 7 days). */
export const INTRODUCTION_SETTLE_DAYS = 7;
/** A figure needs at least this many accounts behind it, otherwise it is unknown (assumption, starting value). */
export const INTRODUCTION_MIN_ACCOUNTS = 5;

/** The target values of US-ONB-08 (starting values, assumptions, not measured yet). */
export const INTRODUCTION_TARGETS = {
  medianSecondsToFirstPlant: 90,
  steps: 3,
  /** At most 25 percent of the new accounts without a plant after 7 days. */
  withoutPlantPercent: 25,
} as const;

/** What the database counts; only numbers, no account (structurally equal to the adapter in `db`). */
export interface IntroductionRaw {
  /** Accounts created within the window. */
  readonly accounts: number;
  /** Of them: at least `INTRODUCTION_SETTLE_DAYS` days old. */
  readonly settled: number;
  /** Of the settled ones: without any specimen (an archived one counts as a plant). */
  readonly settledWithoutPlant: number;
  /** Accounts of the window with a first specimen. */
  readonly withPlant: number;
  /** Median seconds from the creation of the account to the creation of its first specimen; `null` without any. */
  readonly medianSeconds: number | null;
}

export type IntroductionFigure =
  | { readonly known: true; readonly value: number; readonly targetMet: boolean }
  | { readonly known: false; readonly reason: "too_few_accounts" };

/** What the operator sees (US-ONB-08): counts and figures against the targets, never an account. */
export interface IntroductionFigures {
  readonly windowDays: number;
  readonly settleDays: number;
  readonly minAccounts: number;
  readonly accounts: number;
  /** Steps to the first plant by construction (the guide), not measured per person. */
  readonly steps: { readonly value: number; readonly targetMet: boolean };
  /** From the creation of the account (not from "first open", which is not stored) to its first specimen. */
  readonly medianSecondsToFirstPlant: IntroductionFigure;
  /** Share (percent, rounded) of settled accounts that still have no plant. */
  readonly withoutPlantPercent: IntroductionFigure;
}

const TOO_FEW = { known: false, reason: "too_few_accounts" } as const;

/** Pure: turns the counts into figures; a figure below the minimum of accounts stays unknown (P-08, P-05). */
export function introductionFigures(raw: IntroductionRaw): IntroductionFigures {
  const median =
    raw.withPlant >= INTRODUCTION_MIN_ACCOUNTS && raw.medianSeconds !== null
      ? {
          known: true as const,
          value: raw.medianSeconds,
          targetMet: raw.medianSeconds <= INTRODUCTION_TARGETS.medianSecondsToFirstPlant,
        }
      : TOO_FEW;
  const percent = Math.round((raw.settledWithoutPlant / Math.max(raw.settled, 1)) * 100);
  const without =
    raw.settled >= INTRODUCTION_MIN_ACCOUNTS
      ? {
          known: true as const,
          value: percent,
          targetMet: percent <= INTRODUCTION_TARGETS.withoutPlantPercent,
        }
      : TOO_FEW;
  return {
    windowDays: INTRODUCTION_WINDOW_DAYS,
    settleDays: INTRODUCTION_SETTLE_DAYS,
    minAccounts: INTRODUCTION_MIN_ACCOUNTS,
    accounts: raw.accounts,
    steps: {
      value: FIRST_PLANT_STEPS.length,
      targetMet: FIRST_PLANT_STEPS.length <= INTRODUCTION_TARGETS.steps,
    },
    medianSecondsToFirstPlant: median,
    withoutPlantPercent: without,
  };
}

/** Port for the counts; the adapter lives in `db` and checks the operator role again (P-04). */
export interface IntroductionStore {
  figures(userId: string, windowDays: number, settleDays: number): Promise<IntroductionRaw>;
}

/** Read for the operator only (a reviewer is not an operator). */
export async function operatorIntroduction(
  deps: { access: AccessStore; store: IntroductionStore },
  userId: string,
): Promise<Result<IntroductionFigures>> {
  if (!(await isOperator(deps.access)({ userId }))) return failed(appError("access.denied"));
  const raw = await deps.store.figures(userId, INTRODUCTION_WINDOW_DAYS, INTRODUCTION_SETTLE_DAYS);
  return ok(introductionFigures(raw));
}
