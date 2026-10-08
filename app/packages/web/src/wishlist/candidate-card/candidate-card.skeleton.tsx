import { Skeleton } from "@/components/ui/display/skeleton/skeleton";

/** Placeholder with the blocks of a `CandidateCard` (picture, title, three text lines); decorative, no numbers (P-08). */
export function CandidateCardSkeleton() {
  return (
    <li
      aria-hidden="true"
      className="grid min-w-0 content-start gap-2 rounded-xl border border-border bg-card p-3"
    >
      <Skeleton className="h-18 w-full" />
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
    </li>
  );
}
