import { Suspense, type ReactNode } from "react";
import type { SpecimenCard } from "@pflanzendex/core";

/** The occasions that apply to the list (US-ONB-07): a plant without a place, the first plant that can be measured. */
export function hintOccasionsOf(cards: readonly SpecimenCard[]): string[] {
  const active = cards.filter((c) => c.status !== "archived");
  return [
    ...(active.some((c) => c.location === null) ? ["plant_without_place"] : []),
    ...(active.length > 0 && active.every((c) => c.lastMeasurement === null)
      ? ["first_measurement"]
      : []),
  ];
}

/** The calm hint at the list (US-ONB-07), only when the app wired one and an occasion applies. */
export function ListHint(props: {
  cards: readonly SpecimenCard[];
  render: ((applicable: readonly string[]) => ReactNode) | undefined;
}) {
  const applicable = hintOccasionsOf(props.cards);
  return props.render && applicable.length > 0 ? (
    <Suspense fallback={null}>{props.render(applicable)}</Suspense>
  ) : null;
}
