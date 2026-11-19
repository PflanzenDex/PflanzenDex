import { Skeleton, SkeletonGroup } from "@/shared/ui/display/skeleton/skeleton";
import { GROUP } from "@/shared/lists/grouped-list/group-classes";

/** The six parts of the overview, each a row of one grouped list (US-QS-32, FX-35 step 5): name and info, no thumbnail. */
const PARTS = [0, 1, 2, 3, 4, 5];

/**
 * Placeholder with the layout of the equipment on a phone: the line of help, the one primary action and the grouped list of
 * the six parts (DS-52, DS-53), the shape of the loaded page, so the cold load does not shift.
 */
export function EquipmentPageSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label} className="flex min-w-0 flex-col gap-3">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-11 w-40 rounded-full" />
      <ul aria-hidden="true" className={GROUP}>
        {PARTS.map((i) => (
          <li key={i} className="px-4 py-3">
            <span className="flex min-w-0 flex-col gap-0.5">
              <Skeleton className="my-1 h-4 w-1/2" />
              <Skeleton className="h-5 w-1/3" />
            </span>
          </li>
        ))}
      </ul>
    </SkeletonGroup>
  );
}
