/**
 * Validation for species approval (US-BES-10, FR-BES-05, FR-BES-14).
 * Approval requires complete required fields and sources for light demand and dormancy.
 */

import type { SpeciesValues } from "./species";

export interface ApprovalIssue {
  readonly field: keyof SpeciesValues;
  readonly reason: "missing" | "source_missing" | "invalid";
}

function checkStringField(
  value: string | null | undefined,
  field: keyof SpeciesValues,
): ApprovalIssue | null {
  return !value || value.trim() === "" ? { field, reason: "missing" } : null;
}

function checkNumericField(
  value: number | null | undefined,
  field: keyof SpeciesValues,
): ApprovalIssue | null {
  if (value === null || value === undefined) return { field, reason: "missing" };
  return null;
}

function validateDifficulty(value: number | null | undefined): ApprovalIssue | null {
  if (value === null || value === undefined) return { field: "difficulty", reason: "missing" };
  return value < 1 || value > 3 ? { field: "difficulty", reason: "invalid" } : null;
}

function validateStandardLevel(value: number | null | undefined): ApprovalIssue | null {
  if (value === null || value === undefined) return { field: "standardLevel", reason: "missing" };
  return value < 2 || value > 4 ? { field: "standardLevel", reason: "invalid" } : null;
}

function checkRequiredFields(species: SpeciesValues): ApprovalIssue[] {
  return [
    checkStringField(species.latinName, "latinName"),
    validateDifficulty(species.difficulty),
    validateStandardLevel(species.standardLevel),
    checkNumericField(species.lightDemandLux, "lightDemandLux"),
    checkStringField(species.growthMeasure, "growthMeasure"),
    checkStringField(species.etiolationSigns, "etiolationSigns"),
    checkStringField(species.successCriteria, "successCriteria"),
  ].filter((i): i is ApprovalIssue => i !== null);
}

function checkSourceRequirements(species: SpeciesValues): ApprovalIssue[] {
  const issues: ApprovalIssue[] = [];
  const needsSource =
    (species.lightDemandLux && species.lightDemandLux > 0) ||
    species.dormancyFrom ||
    species.dormancyUntil;
  if (needsSource && (!species.source || species.source.trim() === "")) {
    issues.push({ field: "source", reason: "source_missing" });
  }
  return issues;
}

/**
 * Check if a species is complete enough to be approved.
 * Required fields (FR-BES-05): latin_name, difficulty, standard_level, light_demand_lux,
 * growth_measure, etiolation_signs, success_criteria.
 * Additional requirements for approval (FR-BES-14):
 * - If light_demand_lux exists, source must be provided.
 * - If dormancy period exists, source must be provided.
 */
export function checkApprovalReadiness(species: SpeciesValues): readonly ApprovalIssue[] {
  return [...checkRequiredFields(species), ...checkSourceRequirements(species)];
}

/**
 * Check if a species is ready for approval (no issues).
 */
export function isApprovalReady(species: SpeciesValues): boolean {
  return checkApprovalReadiness(species).length === 0;
}
