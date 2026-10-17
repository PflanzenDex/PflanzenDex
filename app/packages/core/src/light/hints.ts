import type { LightLocation } from "./types";

export interface Hint {
  readonly kind: "location_without_zone";
  readonly locationId: string;
  readonly text: string;
  /** P-09: every view says what to do next. */
  readonly nextAction: string;
}

/** Hints for US-BES-08 ("Hints"): locations without a light zone. The hints page itself follows with BES-08. */
export function locationHints(locations: readonly LightLocation[]): readonly Hint[] {
  return locations
    .filter((s) => s.lightZoneId === null)
    .map((s) => ({
      kind: "location_without_zone",
      locationId: s.id,
      text: `Der Standort „${s.name}“ hat noch keine Lichtzone.`,
      nextAction: "Weise dem Standort eine Lichtzone zu.",
    }));
}
