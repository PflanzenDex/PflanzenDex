import { PageTitle } from "@/shared/patterns/navigation/page-header/page-title/page-title";
import { DelayedSkeleton } from "@/shared/ui/skeleton.delayed";
import { SkeletonGroup } from "@/shared/ui/skeleton";
import { Skeleton } from "@/shared/ui/skeleton";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "./today-skeleton.de.json";
import { TodaySkeletonBody } from "./today-skeleton-body/today-skeleton-body";

const t = texts(table);

/**
 * The skeleton of "Heute" in the shape of `TodayPage` (US-QS-14, DS-52, DS-53, issue 1697): the title, then the body of
 * the page (`TodaySkeletonBody`). It is the route fallback of "Heute", so the page keeps one shape while it loads. The title
 * stands at once; the blocks wait for the delay (DS-57). The bar shows one title while several are mounted (issue 2230).
 */
export function TodaySkeleton() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <PageTitle title={t("page.title")} />
      <TodaySkeletonBody />
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
