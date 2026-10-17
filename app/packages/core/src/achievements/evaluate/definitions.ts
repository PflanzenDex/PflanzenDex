// The definitions (DM-ACH-01): stable id, group, version and the criterion. The order is fixed; open achievements are
// listed in this order, not ranked by an invented effort (P-08, US-ACH-02). Nothing here rewards buying (FR-ACH-05).
import { cuttingRooted, throughDormancy, treatmentCompleted } from "../criteria/care";
import { firstMeasurementPhoto, healthyForAYear } from "../criteria/growth";
import { firstHandover } from "../criteria/swapping";
import type { AchievementDefinition } from "../types";

export const ACHIEVEMENT_DEFINITIONS: readonly AchievementDefinition[] = [
  { id: "first-measurement-photo", group: "growth", version: 1, criterion: firstMeasurementPhoto },
  { id: "cutting-rooted", group: "care", version: 1, criterion: cuttingRooted },
  { id: "treatment-completed", group: "care", version: 1, criterion: treatmentCompleted },
  { id: "through-dormancy", group: "care", version: 1, criterion: throughDormancy },
  { id: "healthy-for-a-year", group: "growth", version: 1, criterion: healthyForAYear },
  { id: "first-handover", group: "swapping", version: 1, criterion: firstHandover },
];
