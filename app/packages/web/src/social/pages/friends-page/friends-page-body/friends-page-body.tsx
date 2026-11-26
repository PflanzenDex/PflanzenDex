import { texts } from "@/shared/lib/text-rules/texts";
import { DelayedSkeleton } from "@/shared/ui/skeleton.delayed";
import { Skeleton, SkeletonGroup } from "@/shared/ui/skeleton";
import table from "./friends-page-body.de.json";

const t = texts(table);

/**
 * Placeholder with the layout of the screen on a phone: the action, then the region that scrolls with the two counted rows,
 * the section of the friends, the two exchange tiles and the row of what friends see (DS-52, DS-53). The gaps are those of
 * the page (`gap-3` around the region, `gap-4` inside it), so the blocks do not move when the page arrives.
 */
export function FriendsPageSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label} className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <Skeleton className="h-12 w-full" />
      <div className="flex min-w-0 flex-col gap-4">
        <Skeleton className="h-36 w-full" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-[4.5rem] w-full" />
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
        <Skeleton className="h-12 w-full" />
      </div>
    </SkeletonGroup>
  );
}

/**
 * The body of "Freunde" while its page loads (US-QS-14, DS-57, issue 2243): the placeholder of the screen after the delay.
 * The route's fallback draws it under the page's heading, and the start frame draws the same body under the title in the
 * top bar, so the start and the route show one shape. It imports no header and no link, so the start chunk can carry it.
 */
export function FriendsPageBody() {
  return (
    <DelayedSkeleton>
      <FriendsPageSkeleton label={t("page.loading")} />
    </DelayedSkeleton>
  );
}
