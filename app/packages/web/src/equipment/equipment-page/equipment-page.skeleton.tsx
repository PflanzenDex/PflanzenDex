import { Skeleton, SkeletonGroup } from "@/shared/ui/display/skeleton/skeleton";
import { GROUP } from "@/shared/lists/grouped-list/group-classes";

/** The six parts of the overview, each one line of one grouped list (US-QS-32, FX-35 step 5): name and value, no thumbnail. */
const PARTS = [0, 1, 2, 3, 4, 5];

/**
 * Placeholder with the layout of the equipment on a phone: the line of help, the one primary action and the grouped list of
 * the six one-line parts (DS-52, DS-53), the shape of the loaded page, so the cold load does not shift.
 */
export function EquipmentPageSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label} className="flex min-w-0 flex-col gap-3">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-11 w-40 rounded-full" />
      <ul aria-hidden="true" className={GROUP}>
        {PARTS.map((i) => (
          <li key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="my-1 h-4 w-1/2" />
            <Skeleton className="ml-auto h-4 w-1/4" />
          </li>
        ))}
      </ul>
    </SkeletonGroup>
  );
}
