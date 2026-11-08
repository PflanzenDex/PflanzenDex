import { HintsPageSkeleton } from "@/collection";
import { OpenTreatmentsSkeleton } from "@/care";
import { WateringListSkeleton } from "@/monitoring";
import { texts } from "@/shared/lib/text-rules/texts";
import { DelayedSkeleton } from "@/shared/ui/display/skeleton/delayed-skeleton/delayed-skeleton";
import { SkeletonGroup } from "@/shared/ui/display/skeleton/skeleton";
import type { ReactNode } from "react";
import table from "./today-area.de.json";

const t = texts(table);

/** A layer's skeleton that carries the one loading status; it shows after the delay (DS-57). */
function LayerSkeleton(props: { label: string; children: ReactNode }) {
  return (
    <DelayedSkeleton>
      <SkeletonGroup label={props.label} className="flex min-w-0 flex-col gap-3">
        {props.children}
      </SkeletonGroup>
    </DelayedSkeleton>
  );
}

/** The layer "Behandlungen" while its part loads: two open treatments (US-QS-14, DS-52). */
export function TreatmentsLayerSkeleton() {
  return (
    <LayerSkeleton label={t("layer.treatments")}>
      <OpenTreatmentsSkeleton />
    </LayerSkeleton>
  );
}

/** The layer "Gießen" while its part loads: the rows of the watering list (US-QS-14, DS-52). */
export function WateringLayerSkeleton() {
  return <WateringListSkeleton label={t("layer.watering")} />;
}

/** The layer "Fehlt noch" while its part loads: the hint cards (US-QS-14, DS-52). */
export function HintsLayerSkeleton() {
  return (
    <DelayedSkeleton>
      <HintsPageSkeleton label={t("layer.hints")} host />
    </DelayedSkeleton>
  );
}
