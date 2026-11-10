import type { ComponentProps } from "react";
import { useFeature } from "@/shared/data";
import { LABELS_PATH } from "@/shared/patterns/navigation/navigation/navigation";
import { ViewLayer } from "../plant-layers/view-layer/view-layer";

type Group = "all" | "phase" | "location";

/**
 * The layer "Ansicht" of the plants (US-QS-19), typed with the groupings of the plants. It leads to the print of the pot
 * labels, which adds no row to the title area of the Sammlung (US-BES-17); the keeper switch "pot_labels" hides it (P-12).
 */
export function PlantsViewLayer(props: ComponentProps<typeof ViewLayer<Group>>) {
  const labels = useFeature("pot_labels");
  return <ViewLayer {...props} labelsTo={labels ? LABELS_PATH : undefined} />;
}
