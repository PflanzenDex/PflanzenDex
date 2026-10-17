import { Skeleton, SkeletonGroup } from "@/components/ui/display/skeleton/skeleton";

/** Placeholder with the layout of the page on a phone: two cards, form fields and the save button (DS-52, DS-53). */
export function EquipmentPageSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label} className="flex min-w-0 flex-col gap-4">
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-7 w-1/2" />
      <Skeleton className="h-11 w-full max-w-xl" />
      <Skeleton className="h-12 w-full max-w-xl" />
    </SkeletonGroup>
  );
}
