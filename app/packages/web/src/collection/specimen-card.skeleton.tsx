import { Skeleton } from "@/components/ui/skeleton";
import { CARD } from "./parts";

/** Placeholder with the blocks of a specimen card: photo, title, three lines, measurement and the action row (DS-52, DS-53). */
export function SpecimenCardSkeleton() {
  return (
    <li aria-hidden="true" className={CARD}>
      <Skeleton className="aspect-[4/3] w-full" />
      <Skeleton className="mt-2 h-7 w-2/3" />
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="h-5 w-4/5" />
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-6 w-full" />
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="mt-3 h-11 w-full" />
    </li>
  );
}
