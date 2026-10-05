import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";

/** Placeholder with the layout of the settings on a phone: two fields, two switch groups and the save button (DS-52, DS-53). */
export function SettingsPageSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label} className="flex min-w-0 max-w-xl flex-col gap-4">
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-12 w-full" />
    </SkeletonGroup>
  );
}
