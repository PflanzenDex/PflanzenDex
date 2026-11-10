import type { ReactNode } from "react";
import { DelayedSkeleton } from "@/shared/ui/display/skeleton/delayed-skeleton/delayed-skeleton";
import { Skeleton, SkeletonGroup } from "@/shared/ui/display/skeleton/skeleton";

/** The plant's layer while the plant loads: the photo, the name and the two actions of the layer (US-BES-01, DS-52, DS-53); shows after the delay (DS-57). */
export function PlantLayerSkeleton({ label }: { label: string }) {
  return (
    <DelayedSkeleton>
      <SkeletonGroup label={label} className="flex min-w-0 flex-col gap-3">
        <Skeleton className="h-40 w-full rounded-card" />
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-5 w-1/2" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-11 w-32" />
          <Skeleton className="h-11 w-32" />
        </div>
      </SkeletonGroup>
    </DelayedSkeleton>
  );
}

/** The parts of the plant layer that another module loads (US-QS-23): the growth trend, the measurements, the treatments and "Gießen". */
export type SlotPart = "growth" | "history" | "care" | "water";

/** The shape of each part as it stands in the layer (DS-52, DS-53): the one-line trend, two measurement cards, the open treatment with the plan button and the done line, the button. */
const SHAPES: Record<SlotPart, ReactNode> = {
  growth: <Skeleton className="h-5 w-3/4" />,
  history: (
    <>
      <Skeleton className="h-24 w-full rounded-lg" />
      <Skeleton className="h-24 w-full rounded-lg" />
    </>
  ),
  care: (
    <>
      <Skeleton className="h-16 w-full rounded-lg" />
      <Skeleton className="h-11 w-40" />
      <Skeleton className="h-5 w-2/3" />
    </>
  ),
  water: <Skeleton className="h-11 w-32" />,
};

/**
 * The shape of a part of the plant layer while its chunk loads (US-QS-14, DS-52, DS-53): the part's own layout, so the
 * layer does not move when it arrives. It is a status of its own (the label is read out once) and shows after the delay
 * (DS-57); it is a shaped skeleton, so it is never held (DS-57).
 */
export function PlantSlotSkeleton({ part, label }: { part: SlotPart; label: string }) {
  return (
    <DelayedSkeleton>
      <SkeletonGroup label={label} className="grid min-w-0 gap-3">
        {SHAPES[part]}
      </SkeletonGroup>
    </DelayedSkeleton>
  );
}
