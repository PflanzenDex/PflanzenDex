import { Suspense, type ReactNode } from "react";
import type { SpecimenCard } from "@pflanzendex/core";
import { Button } from "@/shared/ui/button/button";
import { texts } from "@/shared/lib/text-rules/texts";
import type { SlotFallback, SlotRender } from "../layer-ids";
import table from "../plant-layers.de.json";
import { PlantSlotSkeleton, type SlotPart } from "./plant-layer.skeleton";

const t = texts(table);

/**
 * "Gießen" while its part loads (SG-STATE-02, F-0082, issue 1889): the same outline button in its place, disabled and
 * busy, from the first frame, so the action row has all its buttons at once and nothing moves when the part arrives.
 */
function WaterPlaceholder() {
  return (
    <Button type="button" variant="outline" disabled aria-busy="true">
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
): ReactNode {
  if (part === "water") return <WaterPlaceholder />;
  if (fallback) return fallback(label);
  return <PlantSlotSkeleton part={part} label={label} />;
}

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
  if (!props.render) return null;
  return (
    <Suspense fallback={slotFallback(props.part, t("slot.loading"), props.fallback)}>
      {props.render(props.card, { measure: props.measure })}
    </Suspense>
  );
}
