import { DelayedSkeleton } from "@/shared/ui/skeleton.delayed";
import { Skeleton, SkeletonGroup } from "@/shared/ui/skeleton";
import { GrowthFrame } from "./growth-frame/growth-frame";

/**
 * The growth line while its chunk loads (US-QS-32): the frame of the loaded line with a bar in its visible cell, so the
 * overview keeps the height the trend will take. One status with the caller's label, read out once (DS-56), and it shows
 * after the delay (DS-57); before the delay the frame keeps its place without drawing anything (SG-STATE-02).
 */
export function PlantGrowthSkeleton({
  label,
  measured = true,
}: {
  label: string;
  /** False while the plant has no measurement: the frame of its one reading (US-QS-23). */
  measured?: boolean;
}) {
  return (
    <DelayedSkeleton before={<GrowthFrame measured={measured} />}>
      <SkeletonGroup label={label} className="min-w-0">
        <GrowthFrame measured={measured}>
          <Skeleton className="h-5 w-3/4" />
        </GrowthFrame>
      </SkeletonGroup>
    </DelayedSkeleton>
  );
}
