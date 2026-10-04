/**
 * Approval readiness of a species proposal (US-BES-10, FR-BES-05, FR-BES-14): complete required fields and a source
 * for light demand and dormancy. Pure; the approve operation calls it, so a reviewer cannot approve an incomplete
 * profile (P-03).
 */
import type { SpeciesValues } from "./species";

export interface ApprovalIssue {
  readonly field: keyof SpeciesValues;
  readonly reason: "missing" | "source_missing";
}

const blank = (value: string | null | undefined): boolean => !value || value.trim() === "";

const REQUIRED_TEXT = ["latinName", "growthMeasure", "etiolationSigns", "successCriteria"] as const;
const REQUIRED_NUMBER = ["difficulty", "standardLevel", "lightDemandLux"] as const;

/**
 * Issues that block approval; empty means ready. The light demand is a required field, so its source is always
 * required; a dormancy period needs the same source (one source field covers the details, DM-BES-01).
 */
export function checkApprovalReadiness(species: SpeciesValues): readonly ApprovalIssue[] {
  const missing = [
    ...REQUIRED_TEXT.filter((f) => blank(species[f])),
    ...REQUIRED_NUMBER.filter((f) => !Number.isFinite(species[f])),
  ].map((field): ApprovalIssue => ({ field, reason: "missing" }));
  const needsSource = Number.isFinite(species.lightDemandLux) || species.dormancyFrom !== null;
  return blank(species.source) && needsSource
    ? [...missing, { field: "source", reason: "source_missing" }]
    : missing;
}
