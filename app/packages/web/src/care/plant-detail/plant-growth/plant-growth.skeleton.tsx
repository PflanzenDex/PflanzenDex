import { DelayedSkeleton } from "@/shared/ui/display/skeleton/delayed-skeleton/delayed-skeleton";
import { Skeleton, SkeletonGroup } from "@/shared/ui/display/skeleton/skeleton";
import { GrowthFrame } from "./growth-frame/growth-frame";

/**
 * The growth line while its chunk loads (US-QS-32): the frame of the loaded line with a bar in its visible cell, so the
 * overview keeps the height the trend will take. One status with the caller's label, read out once (DS-56), and it shows
 * after the delay (DS-57); before the delay the frame keeps its place without drawing anything (SG-STATE-02).
 */
export function PlantGrowthSkeleton({ label }: { label: string }) {
  return (
    <DelayedSkeleton before={<GrowthFrame />}>
      <SkeletonGroup label={label} className="min-w-0">
        <GrowthFrame>
          <Skeleton className="h-5 w-3/4" />
        </GrowthFrame>
      </SkeletonGroup>
    </DelayedSkeleton>
  );
}
