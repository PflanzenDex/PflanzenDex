import type { ComponentProps } from "react";
import { ViewLayer } from "../plant-layers/view-layer/view-layer";

type Group = "all" | "phase" | "location";

/** The layer "Ansicht" of the plants (US-QS-19), typed with the groupings of the plants. */
export function PlantsViewLayer(props: ComponentProps<typeof ViewLayer<Group>>) {
  return <ViewLayer {...props} />;
}
