import { Suspense, type ReactNode } from "react";
import type { SpecimenSummary } from "@pflanzendex/core";

/**
 * The occasions that apply to the list (US-ONB-07): a plant without a place, the first plant that can be measured. They
 * come from the summary over all plants (FR-BES-23), so a plant beyond the loaded page still counts.
 */
export function hintOccasionsOf(
  summary: Pick<SpecimenSummary, "total" | "unplaced" | "anyMeasured">,
): string[] {
  return [
    ...(summary.unplaced > 0 ? ["plant_without_place"] : []),
    ...(summary.total > 0 && !summary.anyMeasured ? ["first_measurement"] : []),
  ];
}

/** The calm hint at the list (US-ONB-07), only when the app wired one and an occasion applies. */
export function ListHint(props: {
  summary: Pick<SpecimenSummary, "total" | "unplaced" | "anyMeasured">;
  render: ((applicable: readonly string[]) => ReactNode) | undefined;
}) {
  const applicable = hintOccasionsOf(props.summary);
  return props.render && applicable.length > 0 ? (
    <Suspense fallback={null}>{props.render(applicable)}</Suspense>
  ) : null;
}
