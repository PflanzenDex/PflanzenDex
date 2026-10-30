/**
 * Approval readiness of a species proposal (US-BES-10, FR-BES-05, FR-BES-14): complete required fields and a source
 * for light demand and dormancy. Difficulty, default level and lux demand may be unknown (P-08, assumption decided by
 * the PO, #1003): a value without a source is never invented, so it does not block approval; a given one needs a source. Pure; the approve operation calls it, so a reviewer cannot approve an incomplete
 * profile (P-03).
 */
import type { SpeciesValues } from "../species";

export interface ApprovalIssue {
  readonly field: keyof SpeciesValues;
  readonly reason: "missing" | "source_missing";
}

const blank = (value: string | null | undefined): boolean => !value || value.trim() === "";

const REQUIRED_TEXT = ["latinName", "growthMeasure", "etiolationSigns", "successCriteria"] as const;

/**
 * Issues that block approval; empty means ready. A given light demand (lux or default level) or dormancy period needs
 * a source (one source field covers the details, DM-BES-01).
 */
export function checkApprovalReadiness(species: SpeciesValues): readonly ApprovalIssue[] {
  const missing = REQUIRED_TEXT.filter((f) => blank(species[f])).map((field): ApprovalIssue => ({
    field,
    reason: "missing",
  }));
  const needsSource =
    species.lightDemandLux !== null ||
    species.standardLevel !== null ||
    species.dormancyFrom !== null;
  return blank(species.source) && needsSource
    ? [...missing, { field: "source", reason: "source_missing" }]
    : missing;
}
