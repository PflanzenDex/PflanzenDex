import { Skeleton, SkeletonGroup } from "@/components/ui/display/skeleton/skeleton";

/** Placeholder with the layout of the planning form on a phone: specimen choice, three fields and the button (DS-52, DS-53). */
export function TreatmentFormSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label} className="flex min-w-0 max-w-xl flex-col gap-4">
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-12 w-full" />
    </SkeletonGroup>
  );
}
