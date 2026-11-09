import { LayerHost } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { texts } from "@/shared/lib/text-rules/texts";
import { DelayedSkeleton } from "@/shared/ui/display/skeleton/delayed-skeleton/delayed-skeleton";
import { Skeleton, SkeletonGroup } from "@/shared/ui/display/skeleton/skeleton";
import table from "../../swap.de.json";

const t = texts(table);

/** Placeholder with the layout of the page on a phone: the list and the form fields (DS-52, DS-53). */
export function ExchangeSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label} className="flex min-w-0 flex-col gap-4">
      <Skeleton className="h-7 w-1/2" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-11 w-full max-w-xl" />
      <Skeleton className="h-11 w-full max-w-xl" />
    </SkeletonGroup>
  );
}

/**
 * A button of the page: its box keeps the height of the loaded button from the first frame (DS-52), and the block shows
 * only after the delay (DS-57).
 */
function ActionBlock({ className }: { className: string }) {
  return (
    <div className={className}>
      <DelayedSkeleton>
        <Skeleton className="h-full w-full rounded-pill" />
      </DelayedSkeleton>
    </div>
  );
}

/**
 * The route's fallback of "Freunde Tausch" until its chunk is there (issue 1727): the title stands at once as the one h1
 * with its way back and the offer action in one row, the link to the matching offers and the privacy line are the page's
 * own (the line shows from the medium width, as on the page), and the list waits for the delay (DS-57). The route shows the
 * list's shape, not a part's.
 */
export function ExchangeRouteSkeleton() {
  return (
    <LayerHost className="min-h-0" data-fit-screen="" data-fit-fill="">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span aria-hidden="true" className="block size-11 shrink-0" />
          <h1
            data-route-fallback=""
            className="min-w-min flex-1 text-2xl font-semibold [overflow-wrap:normal]"
          >
            {t("exchange.title")}
          </h1>
          <ActionBlock className="h-12 w-52 shrink-0" />
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <ActionBlock className="h-12 w-52" />
          <p className="hidden text-muted-foreground md:block">{t("exchange.privacy")}</p>
          <DelayedSkeleton>
            <ExchangeSkeleton label={t("exchange.loading")} />
          </DelayedSkeleton>
        </div>
      </section>
    </LayerHost>
  );
}
