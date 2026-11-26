import { Skeleton } from "@/shared/ui/skeleton";
import { OBJECT_GROUP } from "../grouped-list/group-classes";

/**
 * The rows of an object list while it loads (SG-STATE-02, US-QS-32, FX-35 step 5): one group of rows with the 56 px
 * thumbnail box and the title and meta line of an `ObjectRow`, so the loaded list takes the same height and nothing
 * shifts. Decorative and hidden from assistive technology: the page's own status says that it loads. No number in it (P-08).
 */
export function ObjectRowsSkeleton({ rows }: { rows: number }) {
  return (
    <ul aria-hidden="true" className={OBJECT_GROUP}>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex min-w-0 items-center gap-2 px-2 py-2.5">
          <Skeleton className="size-[56px] shrink-0 rounded-lg" />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <Skeleton className="my-1 h-4 w-3/5" />
            <Skeleton className="h-5 w-2/5" />
          </span>
        </li>
      ))}
    </ul>
  );
}
