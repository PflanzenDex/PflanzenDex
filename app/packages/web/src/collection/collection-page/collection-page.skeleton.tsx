import { Skeleton, SkeletonGroup } from "@/components/ui/display/skeleton/skeleton";
import { GRID } from "../specimens/cards/parts/parts";
import { SpecimenCardSkeleton } from "../specimens/cards/specimen-card/specimen-card.skeleton";

/** Placeholder with the layout of the collection on a phone: title, distribution, two cards and the button (DS-52, DS-53). */
export function CollectionPageSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label} className="flex min-w-0 flex-col gap-4">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-44 w-full rounded-xl" />
      <ul className={GRID}>
        <SpecimenCardSkeleton />
        <SpecimenCardSkeleton />
      </ul>
      <Skeleton className="h-12 w-full sm:w-64" />
    </SkeletonGroup>
  );
}
