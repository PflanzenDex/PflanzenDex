import { LayerOpener } from "@/components/shared/responsive/layer-sheet/layer-sheet";
import { VIEW_LAYER } from "@/components/sammlung-header/view-layer/view-layer";

/** The button "Ansicht" beside the heading of the Sammlung: opens the layer of the grouping (US-QS-19). */
export function PlantsViewOpener() {
  return <LayerOpener id={VIEW_LAYER}>Ansicht</LayerOpener>;
}
