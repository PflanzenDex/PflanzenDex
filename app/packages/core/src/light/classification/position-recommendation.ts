// Position recommendation based on light demand (US-LIC-03).

/** Position category with German UI text (P-01: show to user). */
export const POSITIONS = [
  "directly_under_lamp",
  "very_close",
  "close",
  "medium_distance",
  "further_away",
] as const;

export type PositionCategory = (typeof POSITIONS)[number];

export interface PositionRecommendation {
  readonly category: PositionCategory;
  readonly description: string; // German, for UI
}

/**
 * The four lower bounds in lux for "directly under the lamp", "very close", "close" and "medium distance", strictly
 * descending. Starting values (assumption, decided by the PO); the keeper can change them (FR-LIC-05).
 */
export type PositionThresholds = readonly [number, number, number, number];

export const POSITION_THRESHOLD_DEFAULTS: PositionThresholds = [50_000, 15_000, 8_000, 4_000];

/** Highest allowed threshold: the upper end of the catalog's lux demand (200,000, FR-BES-10). */
export const POSITION_THRESHOLD_MAX = 200_000;

/** Whole lux values from 1 to the maximum, each lower than the one before. */
export function isPositionThresholds(value: unknown): value is PositionThresholds {
  return (
    Array.isArray(value) &&
    value.length === POSITION_THRESHOLD_DEFAULTS.length &&
    value.every(
      (v, i) =>
        typeof v === "number" &&
        Number.isInteger(v) &&
        v >= 1 &&
        v <= POSITION_THRESHOLD_MAX &&
        (i === 0 || v < (value[i - 1] as number)),
    )
  );
}

/** The stored thresholds, or the defaults when none were set or the stored value is not usable (P-08). */
export const positionThresholdsOrDefault = (stored: unknown): PositionThresholds =>
  isPositionThresholds(stored) ? stored : POSITION_THRESHOLD_DEFAULTS;

const STEPS = [
  { category: "directly_under_lamp", description: "direkt unter der Lampe" },
  { category: "very_close", description: "sehr nah (~10 cm)" },
  { category: "close", description: "nah (~20–30 cm)" },
  { category: "medium_distance", description: "mittlerer Abstand (~40 cm)" },
] as const;

const FURTHER_AWAY = {
  category: "further_away",
  description: "darf weiter weg stehen",
} as const;

/**
 * Recommend a position based on light demand in lux. The thresholds are the keeper's (FR-LIC-05) and default to
 * `POSITION_THRESHOLD_DEFAULTS`. The category is used as a stable key; the description is German
 * for the UI (P-01). A demand that is not a finite number >= 0 has no recommendation (`null`, P-08): the
 * function never invents a position for bad data.
 */
export function recommendPosition(
  lightDemandLux: number,
  thresholds: PositionThresholds = POSITION_THRESHOLD_DEFAULTS,
): PositionRecommendation | null {
  if (!Number.isFinite(lightDemandLux) || lightDemandLux < 0) return null;
  const i = thresholds.findIndex((min) => lightDemandLux >= min);
  const t = i < 0 ? FURTHER_AWAY : STEPS[i];
  return t ? { category: t.category, description: t.description } : null;
}
