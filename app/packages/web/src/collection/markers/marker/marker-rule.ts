import type { SpecimenCard } from "@pflanzendex/core";

/** The active specimens of the chosen species, as far as the form needs them (US-BES-03). */
export type Sibling = Pick<SpecimenCard, "id" | "name" | "marker">;

/** Default marker of the naming rule (DM-BES-03): "clip"; only a preset, freely changeable. */
const DEFAULT_MARKER = "Klammer";

/**
 * The rule for the new specimen: the 1st needs no marker, the 2nd and later do, from the 3rd on the others too.
 * Kept apart from `marker-fields`, which loads lazily: the marker hook needs the rule without the component (issue 1638).
 */
export function markerRule(siblings: readonly Sibling[]) {
  return {
    required: siblings.length >= 1,
    missing: siblings.length >= 2 ? siblings.filter((s) => s.marker === null) : [],
    preset: siblings.some((s) => s.marker?.toLowerCase() === DEFAULT_MARKER.toLowerCase())
      ? ""
      : DEFAULT_MARKER,
  };
}
