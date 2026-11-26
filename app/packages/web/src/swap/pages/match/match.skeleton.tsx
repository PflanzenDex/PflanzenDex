import { FullView } from "@/shared/patterns/navigation/full-view/full-view";
import { EXCHANGE_PATH } from "@/shared/patterns/navigation/navigation/navigation";
import { Skeleton, SkeletonGroup } from "@/shared/ui/skeleton";
import { DelayedSkeleton } from "@/shared/ui/skeleton.delayed";
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
 * The route's fallback of "Passende Angebote" until its chunk is there (issue 1727): the page's header (the title as the one
 * h1 in the top bar below md, with its way back, US-QS-32), so the title does not move when the page arrives. The intro is
 * the page's own text, and the deck waits for the delay (DS-57). The page is not framed in the content column, so the
 * fallback is not either.
 */
export function MatchRouteSkeleton() {
  return (
    <div data-fit-screen="" className="flex min-w-0 flex-col">
      <FullView
        fallback
        title={t("match.title")}
        back={{ label: t("match.back"), to: EXCHANGE_PATH }}
      >
        <p className="text-muted-foreground [@media(max-height:700px)]:hidden">
          {t("match.intro")}
        </p>
        <DelayedSkeleton>
          <DeckSkeleton label={t("match.loading")} />
        </DelayedSkeleton>
      </FullView>
    </div>
  );
}
