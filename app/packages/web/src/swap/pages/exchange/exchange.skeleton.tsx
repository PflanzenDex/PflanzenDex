import { FullView } from "@/shared/patterns/navigation/full-view/full-view";
import { LayerHost } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { texts } from "@/shared/lib/text-rules/texts";
import { DelayedSkeleton } from "@/shared/ui/skeleton.delayed";
import { Skeleton, SkeletonGroup } from "@/shared/ui/skeleton";
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
 * The route's fallback of "Freunde Tausch" until its chunk is there (issue 1727): the page's header (the title as the one h1
 * in the top bar below md, with its way back and the offer action, US-QS-32), so the title does not move when the page
 * arrives. The link to the matching offers and the privacy line are the page's own (the line shows from the medium width, as
 * on the page), and the list waits for the delay (DS-57). The route shows the list's shape, not a part's.
 */
export function ExchangeRouteSkeleton() {
  return (
    <LayerHost className="min-h-0" data-fit-screen="" data-fit-fill="">
      <FullView
        fallback
        title={t("exchange.title")}
        back={{ label: t("exchange.back"), to: "/friends" }}
        action={<ActionBlock className="h-12 w-52 shrink-0" />}
      >
        <ActionBlock className="h-12 w-52" />
        <p className="hidden text-muted-foreground md:block">{t("exchange.privacy")}</p>
        <DelayedSkeleton>
          <ExchangeSkeleton label={t("exchange.loading")} />
        </DelayedSkeleton>
      </FullView>
    </LayerHost>
  );
}
