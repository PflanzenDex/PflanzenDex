import { cn } from "@/shared/lib/utils";
import { DelayedSkeleton } from "@/shared/ui/skeleton.delayed";
import { Skeleton } from "@/shared/ui/skeleton";
import { ROW_GROUP } from "@/shared/lists/grouped-list/group-classes";

/**
 * The layer's rows while the banner loads (US-QS-32, DS-52, DS-57): the chip row and row placeholders, at the heights of
 * the controls they stand for, in the same nesting as the rows, so they keep their places when the content arrives (the
 * layout shift of a cold load). The rows are the scroll content of the layer, no pages (US-QS-15). Decorative and without text: the layer's title names it, and no status
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
            <ul className={cn("flex min-h-0 flex-1 flex-col content-start", ROW_GROUP)}>
              {Array.from({ length: rows }, (_, n) => (
                <li key={n} className="flex min-h-11 items-center px-4 py-3">
                  <Skeleton className="h-6 w-2/3" />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </DelayedSkeleton>
  );
}
