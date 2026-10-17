import { Skeleton } from "@/components/ui/display/skeleton/skeleton";

/**
 * Placeholder with the layout of two open treatments on a phone (DS-52, DS-53). It is decorative: the page announces
 * the one loading status, so the screen reader hears a single "loading" (DS-56).
 */
export function OpenTreatmentsSkeleton() {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Skeleton className="h-36 w-full" />
      <Skeleton className="h-36 w-full" />
    </div>
  );
}
