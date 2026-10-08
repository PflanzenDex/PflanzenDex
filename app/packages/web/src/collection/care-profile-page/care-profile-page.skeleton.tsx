import { Skeleton, SkeletonGroup } from "@/components/ui/display/skeleton/skeleton";
import { CARD, PROFILE_GRID } from "../parts";

/** Placeholder with the layout of the care profile on a phone: intro and a card with its fields and the save button (DS-52, DS-53). */
export function CareProfileSectionSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label} className="flex min-w-0 flex-col gap-3">
      <Skeleton className="h-14 w-full" />
      <ul className={PROFILE_GRID}>
        <li aria-hidden="true" className={CARD}>
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-5 w-1/2" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="grid gap-2 border-t border-border py-3">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
            </div>
          ))}
          <Skeleton className="h-12 w-full" />
        </li>
      </ul>
    </SkeletonGroup>
  );
}
