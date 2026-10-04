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

/** Thresholds in lux for position recommendations. */
const POSITION_THRESHOLDS = [
  {
    minLux: 50_000,
    category: "directly_under_lamp" as const,
    description: "direkt unter der Lampe",
  },
  { minLux: 15_000, category: "very_close" as const, description: "sehr nah (~10 cm)" },
  { minLux: 8_000, category: "close" as const, description: "nah (~20–30 cm)" },
  {
    minLux: 4_000,
    category: "medium_distance" as const,
    description: "mittlerer Abstand (~40 cm)",
  },
  { minLux: 0, category: "further_away" as const, description: "darf weiter weg stehen" },
] as const;

/**
 * Recommend a position based on light demand in lux. The thresholds are defaults and adjustable (FR-LIC-05);
 * this function uses the hardcoded defaults. The category is used as a stable key; the description is German
 * for the UI (P-01).
 */
export function recommendPosition(lightDemandLux: number): PositionRecommendation {
  for (const threshold of POSITION_THRESHOLDS) {
    if (lightDemandLux >= threshold.minLux) {
      return {
        category: threshold.category,
        description: threshold.description,
      };
    }
  }
  // This should not happen given the catch-all at 0, but be explicit.
  return {
    category: "further_away",
    description: "darf weiter weg stehen",
  };
}
