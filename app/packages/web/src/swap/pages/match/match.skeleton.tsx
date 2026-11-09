import { Skeleton, SkeletonGroup } from "@/shared/ui/display/skeleton/skeleton";
import { DelayedSkeleton } from "@/shared/ui/display/skeleton/delayed-skeleton/delayed-skeleton";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "../../swap.de.json";

const t = texts(table);

/** The deck while its offers load: one card and the answer buttons (DS-52, DS-53). */
export function DeckSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label} className="mx-auto flex w-full max-w-md flex-col gap-3">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-12 w-full" />
    </SkeletonGroup>
  );
}

/**
 * The route's fallback of "Passende Angebote" until its chunk is there (issue 1727): the title stands at once as the one
 * h1 with its way back beside it, the intro is the page's own text, and the deck waits for the delay (DS-57). The page is
 * not framed in the content column, so the fallback is not either.
 */
export function MatchRouteSkeleton() {
  return (
    <div data-fit-screen="" className="flex min-w-0 flex-col">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span aria-hidden="true" className="block size-11 shrink-0" />
          <h1
            data-route-fallback=""
            className="max-w-full grow basis-[230px] text-2xl font-semibold [overflow-wrap:break-word]"
          >
            {t("match.title")}
          </h1>
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <p className="text-muted-foreground [@media(max-height:700px)]:hidden">
            {t("match.intro")}
          </p>
          <DelayedSkeleton>
            <DeckSkeleton label={t("match.loading")} />
          </DelayedSkeleton>
        </div>
      </section>
    </div>
  );
}
