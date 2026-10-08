import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";

/** Placeholder with the layout of the page on a phone: heading, overview card, two zone cards and a form (DS-52, DS-53). */
export function LightPageSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label} className="flex min-w-0 flex-col gap-4">
      <Skeleton className="h-8 w-2/3 max-w-xs" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-12 w-full" />
    </SkeletonGroup>
  );
}

/** Placeholder of an onboarding step: a list entry and the form (DS-52). */
export function SetupStepSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label} className="flex min-w-0 flex-col gap-3">
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
    </SkeletonGroup>
  );
}
