import { DelayedSkeleton } from "@/shared/ui/display/skeleton/delayed-skeleton/delayed-skeleton";
import { Skeleton, SkeletonGroup } from "@/shared/ui/display/skeleton/skeleton";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "../../today.de.json";

const t = texts(table);

/**
 * The skeleton of "Heute" in the shape of `TodayPage` (US-QS-14, DS-52, DS-53, issue 1697): the title, the summary line,
 * the "Jetzt dran" card and two tiles, in the container of the page. It is the route fallback and the fallback of the
 * area's parts, so the page keeps one shape while it loads. The title stands at once; the blocks wait for the delay (DS-57).
 */
export function TodaySkeleton() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <h1 data-route-fallback="" className="text-2xl font-semibold">
        {t("page.title")}
      </h1>
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
    </div>
  );
}

/**
 * The "Jetzt dran" part alone while its list loads (DS-52, DS-57): one card block in the shape of a row. Its status is the
 * one loading text of the part, so the page does not announce the same wait twice.
 */
export function NowSkeleton(props: { label: string }) {
  return (
    <DelayedSkeleton>
      <SkeletonGroup label={props.label} className="flex min-w-0 flex-col gap-2">
        <Skeleton className="h-24 w-full rounded-card" />
      </SkeletonGroup>
    </DelayedSkeleton>
  );
}
