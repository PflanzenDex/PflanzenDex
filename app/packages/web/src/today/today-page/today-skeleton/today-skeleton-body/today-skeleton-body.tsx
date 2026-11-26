import { DelayedSkeleton } from "@/shared/ui/skeleton.delayed";
import { Skeleton, SkeletonGroup } from "@/shared/ui/skeleton";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "./today-skeleton-body.de.json";

const t = texts(table);

/**
 * The body of the skeleton of "Heute" (US-QS-14, DS-52, DS-53, issue 1697): the summary line, the "Jetzt dran" card and two
 * tiles, after the title. It has no header and imports no header, so the start frame can draw it too (issue 2230): the
 * start frame and the route both show this body, and the title stands in the top bar or the content of the page.
 */
export function TodaySkeletonBody() {
  return (
    <DelayedSkeleton>
      <SkeletonGroup label={t("page.loading")} className="flex min-w-0 flex-col gap-3">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-24 w-full rounded-card" />
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-20 rounded-card" />
          <Skeleton className="h-20 rounded-card" />
        </div>
      </SkeletonGroup>
    </DelayedSkeleton>
  );
}
