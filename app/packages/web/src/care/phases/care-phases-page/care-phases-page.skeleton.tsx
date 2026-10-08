import { Skeleton, SkeletonGroup } from "@/components/ui/display/skeleton/skeleton";

/** Placeholder with the layout of the care phases on a phone: the switch button, a section title and two entries (DS-52, DS-53). */
export function CarePhasesSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label} className="flex min-w-0 flex-col gap-4">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-7 w-2/3" />
      <Skeleton className="h-44 w-full" />
      <Skeleton className="h-44 w-full" />
    </SkeletonGroup>
  );
}
