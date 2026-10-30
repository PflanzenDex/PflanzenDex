import { Skeleton, SkeletonGroup } from "@/components/ui/display/skeleton/skeleton";

/** Placeholder with the layout of the settings on a phone: the six rows of the groups (DS-52, DS-53). */
export function SettingsPageSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label} className="flex min-w-0 max-w-xl flex-col gap-2">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </SkeletonGroup>
  );
}
