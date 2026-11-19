import { cn } from "@/shared/lib/utils";
import { DelayedSkeleton } from "@/shared/ui/display/skeleton/delayed-skeleton/delayed-skeleton";
import { Skeleton } from "@/shared/ui/display/skeleton/skeleton";
import { ROW_GROUP } from "@/shared/lists/grouped-list/group-classes";

/**
 * The layer's paged rows while the banner loads (US-QS-32, DS-52, DS-57): the chip row, one page of row placeholders
 * and the page bar, at the heights of the controls they stand for, in the same nesting as the rows. The list carries
 * `data-page-fit` as the rows do, so the sheet takes the same 90 dvh and the rows and the bar keep their places when the
 * content arrives (the layout shift of a cold load). Decorative and without text: the layer's title names it, and no status
 * is announced. It shows after the delay of DS-57, at once during the app start.
 */
export function FriendsNewsSkeleton({ rows }: { rows: number }) {
  return (
    <DelayedSkeleton>
      <div
        aria-hidden="true"
        data-news-skeleton=""
        className="flex min-h-0 min-w-0 flex-1 flex-col"
      >
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-11 w-28" />
            <Skeleton className="h-11 w-24" />
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <ul
              data-page-fit=""
              className={cn("flex min-h-0 flex-1 flex-col content-start", ROW_GROUP)}
            >
              {Array.from({ length: rows }, (_, n) => (
                <li key={n} className="flex min-h-11 items-center px-4 py-3">
                  <Skeleton className="h-6 w-2/3" />
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-11 w-20" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-11 w-20" />
            </div>
          </div>
        </div>
      </div>
    </DelayedSkeleton>
  );
}
