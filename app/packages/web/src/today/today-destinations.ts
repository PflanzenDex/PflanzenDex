import type { TodayTarget } from "@pflanzendex/core";
import type { LinkTarget } from "@/shared/patterns/navigation/navigation/navigation";

/** Where an action leads: the app wires the destination to a view (the modules do not know each other). */
export type TodayDestination = TodayTarget | "collection";

/**
 * Where a row of "Heute" leads (US-QS-32): a view, which the row links to by its address, or a layer of the same page, which
 * the row opens in place. A layer needs the element that opened it, so the focus returns to the row when the layer closes
 * (US-QS-15).
 */
export type TodayOpens = { readonly view: LinkTarget } | { readonly layer: "treatments" | "hints" };

/** Every destination opens one place; measuring and the wishlist live in the Sammlung (US-QS-14, US-QS-04). */
export const OPENS: Record<TodayDestination, TodayOpens> = {
  treatments: { layer: "treatments" },
  hints: { layer: "hints" },
  care_phases: { view: "carePhases" },
  measurements: { view: "collection" },
  wishlist: { view: "collection" },
  equipment: { view: "collection" },
  collection: { view: "collection" },
};
