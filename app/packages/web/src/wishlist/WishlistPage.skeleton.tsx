import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";
import { CandidateCardSkeleton } from "./candidate-card/candidate-card.skeleton";

/** Placeholder with the layout of the page on a phone: hint, two cards, form fields and the save button (DS-52, DS-53). */
export function WishlistPageSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label} className="flex min-w-0 flex-col gap-4">
      <Skeleton className="h-16 w-full" />
      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
        <CandidateCardSkeleton />
        <CandidateCardSkeleton />
      </ul>
      <Skeleton className="h-7 w-1/2" />
      <Skeleton className="h-11 w-full max-w-xl" />
      <Skeleton className="h-11 w-full max-w-xl" />
      <Skeleton className="h-12 w-full max-w-xl" />
    </SkeletonGroup>
  );
}
