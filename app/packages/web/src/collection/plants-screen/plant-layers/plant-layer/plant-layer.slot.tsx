import { createContext, Suspense, useContext, type ReactNode } from "react";
import type { SpecimenCard } from "@pflanzendex/core";
import { Button } from "@/shared/ui/button";
import { texts } from "@/shared/lib/text-rules/texts";
import type { SlotFallback, SlotRender } from "../layer-ids";
import table from "../plant-layers.de.json";
import { PlantSlotSkeleton, type SlotPart } from "./plant-layer.skeleton";

const t = texts(table);

/**
 * "Gießen" while its part loads (SG-STATE-02, F-0082, issue 1889): the same tinted button in its place, disabled and
 * busy, from the first frame, so the action row has all its buttons at once and nothing moves when the part arrives.
 */
function WaterPlaceholder() {
  return (
    <Button type="button" variant="tinted" disabled aria-busy="true">
      {t("slot.water")}
    </Button>
  );
}

/**
 * What a part shows while its chunk loads: "Gießen" its disabled button; the part's own fallback when the app gives one (the
 * growth line in the height of its loaded line, US-QS-32); otherwise the part's shape (US-QS-14).
 */
function slotFallback(
  part: SlotPart,
  label: string,
  fallback: SlotFallback | undefined,
  card: SpecimenCard,
): ReactNode {
  if (part === "water") return <WaterPlaceholder />;
  if (fallback) return fallback(label, card);
  return <PlantSlotSkeleton part={part} label={label} />;
}

/**
 * The line directly below the quick actions that holds a result of "Gießen" (`SlotContext.resultHost`, SG-FEED-05, issues
 * 2462, 2536): the quick actions provide it around the part, the slot hands it on; `null` outside them and until it has mounted.
 */
export const ResultHost = createContext<HTMLElement | null>(null);

/**
 * A part from another module, loaded when its tab opens. While its chunk loads it shows its fallback or the part's shape
 * (US-QS-14, US-QS-32), after the delay, so the layer does not move when the part arrives; a shaped skeleton is never held
 * (DS-57). "Gießen" stands as its disabled button at once.
 */
export function Slot(props: {
  render?: SlotRender | undefined;
  part: SlotPart;
  fallback?: SlotFallback | undefined;
  card: SpecimenCard;
  measure: () => void;
}) {
  const resultHost = useContext(ResultHost);
  if (!props.render) return null;
  return (
    <Suspense fallback={slotFallback(props.part, t("slot.loading"), props.fallback, props.card)}>
      {props.render(props.card, { measure: props.measure, resultHost })}
    </Suspense>
  );
}

/**
 * "Verlauf": the calm note of the first measurement (US-ONB-07) stands first, where the measurements will show. It is no
 * part of the overview, which fits the layer without scroll while a note is due (US-QS-23, owner decision 2026-11-21).
 */
export function HistoryTab(props: { note: ReactNode; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      {props.note}
      {props.children}
    </div>
  );
}
