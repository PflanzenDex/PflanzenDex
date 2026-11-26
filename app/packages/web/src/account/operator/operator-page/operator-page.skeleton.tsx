import { Skeleton, SkeletonGroup } from "@/shared/ui/skeleton";
import { DelayedSkeleton } from "@/shared/ui/skeleton.delayed";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "./operator-page.de.json";

const t = texts(table);

/** Placeholder with the layout of the operator page on a phone: five topic rows, one per layer (DS-52, DS-53). */
export function OperatorPageSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label} className="flex min-w-0 max-w-xl flex-col gap-2">
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </SkeletonGroup>
  );
}

/**
 * The body of "Betreiber" while its page loads (US-ACC-05, DS-52, DS-57): the five topic rows of the page. The start frame
 * draws the same body as the route does, so it is exported through the module's index (issue 2230).
 */
export function OperatorRouteBody() {
  return (
    <DelayedSkeleton>
      <OperatorPageSkeleton label={t("operator.loading")} />
    </DelayedSkeleton>
  );
}
