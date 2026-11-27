import { Skeleton, SkeletonGroup } from "@/shared/ui/skeleton";
import { GROUP } from "@/shared/lists/grouped-list/group-classes";

/** The six parts of the overview, each one line of one grouped list (US-QS-32, FX-35 step 5): name and value, no thumbnail. */
const PARTS = [0, 1, 2, 3, 4, 5];

/**
 * Placeholder with the layout of the equipment on a phone (DS-52, DS-53), the shape of the loaded page, so the cold load does
 * not shift: the default button ("Gerät erfassen", 44 px high, the full width of the column, pill-shaped) and the grouped
 * list of the six one-line parts, each 50 px high as a loaded row at 100 % text. The line of help above it is not drawn: the page
 * shows it while it loads.
 */
export function EquipmentPageSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label} className="flex min-w-0 flex-col gap-3">
      <Skeleton className="h-11 w-full rounded-full" />
      <ul aria-hidden="true" className={GROUP}>
        {PARTS.map((i) => (
          <li key={i} className="flex min-h-[50px] items-center gap-3 px-4 py-3">
            <Skeleton className="my-1 h-4 w-1/2" />
            <Skeleton className="ml-auto h-4 w-1/4" />
          </li>
        ))}
      </ul>
    </SkeletonGroup>
  );
}
