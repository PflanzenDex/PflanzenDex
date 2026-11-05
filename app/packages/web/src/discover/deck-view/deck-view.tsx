import type { SuggestionDeck } from "@pflanzendex/core";
import { useEffect, useRef, useState } from "react";
import { EmptyState } from "@/shared/patterns/elements/empty-state/empty-state";
import { Banner } from "@/shared/patterns/states/banner/banner";
import { Button } from "@/shared/ui/button/button";
import { CATALOG_ADDRESS } from "@/shared/patterns/navigation/navigation/navigation";
import { cn } from "@/shared/lib/utils";
import { SuggestionCard } from "../suggestion-card/suggestion-card";
import { SwipeCard } from "@/shared/patterns/elements/swipe-card/swipe-card";
import type { SwipeDirection } from "@/shared/patterns/elements/swipe-card/swipe-gesture";
import table from "../discover.de.json";
import { texts } from "@/shared/lib/text-rules/texts";
import { useDecisions, type Decision, type OnDecide } from "./use-decisions";

const t = texts(table);

/** A button flies the card the way its swipe would, so a button and a gesture give the same result (US-ENT-01). */
const FLIGHT: Record<Decision, SwipeDirection> = { no: "left", yes: "right", later: "up" };
/** A flight decides: a vertical drag is Later in either direction. */
const DECISION: Record<SwipeDirection, Decision> = {
  left: "no",
  right: "yes",
  up: "later",
  down: "later",
};
/** The stamps show the texts of the buttons. */
const STAMPS: Record<SwipeDirection, string> = {
  left: t("deck.no"),
  right: t("deck.yes"),
  up: t("deck.later"),
  down: t("deck.later"),
};

/**
 * True when the text size is raised to 150 % or more (US-QS-21, WCAG 1.4.4). Media queries do not follow the root font
 * size, so the row reads it: a sticky row would then cover the card, so it scrolls with the content instead.
 */
function largeText(): boolean {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) >= 24;
}

/** "Nein · Später · Ja" as buttons; they are the way without a swipe gesture (NFR-13). */
function Actions(props: { onDecide: (d: Decision) => void }) {
  const [large] = useState(largeText);
  return (
    <div
      className={cn(
        // Stays in view with the card (US-QS-14, NFR-13): above the phone bar (3.5 rem plus safe area, a little under
        // the bar's 59 px so no content shows in between), at the window bottom from `md`. A window too low for it
        // (400 % zoom) scrolls it like content.
        "sticky shrink-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10 border-t border-border bg-background py-2",
        "md:bottom-0 [@media(max-height:30rem)]:static",
        // Static content ends under the phone bar otherwise: the area is as high as the screen, its overflow gets no padding.
        large && "static mb-20 md:mb-0",
      )}
    >
      <div className="mx-auto flex w-full max-w-md flex-wrap gap-2">
        <Button
          variant="outline"
          size="touch"
          className="min-w-24 flex-1"
          onClick={() => props.onDecide("no")}
        >
          {t("deck.no")}
        </Button>
        <Button
          variant="secondary"
          size="touch"
          className="min-w-24 flex-1"
          onClick={() => props.onDecide("later")}
        >
          {t("deck.later")}
        </Button>
        <Button size="touch" className="min-w-24 flex-1" onClick={() => props.onDecide("yes")}>
          {t("deck.yes")}
        </Button>
      </div>
    </div>
  );
}

/** The zone the deck is filtered to and, if the catalog does not suffice for it, what to do next (US-ENT-07, P-09). */
function ZoneNotice(props: {
  filter: NonNullable<SuggestionDeck["zoneFilter"]>;
  /** The empty state below already offers the proposal. */
  offerProposal: boolean;
}) {
  const { filter, offerProposal } = props;
  const { shortfall } = filter;
  return (
    <div className="grid gap-2">
      <p className="m-0 font-semibold">
        {t("deck.zone.title", {
          name: filter.name ?? t("deck.zone.fallback", { zone: filter.zone }),
        })}
      </p>
      {shortfall !== null && (
        <Banner variant="warning">
          <p className="m-0">{shortfall.text}</p>
          <p className="m-0">{shortfall.nextAction}</p>
          {offerProposal && (
            <Button asChild variant="outline" size="touch" className="mt-2">
              <a href={CATALOG_ADDRESS}>{t("deck.propose")}</a>
            </Button>
          )}
        </Banner>
      )}
    </div>
  );
}

/** One deck, one card at a time; after the last card "Für heute durch" and "Neuer Stapel" (US-ENT-01). */
function Cards(props: {
  deck: SuggestionDeck;
  /** Writes "Ja" or "Nein" (US-ENT-04); the card moves on only after it is saved, so nothing is lost silently (P-10). */
  onDecide: OnDecide;
  onNewDeck: () => void;
  /** True for a deck the keeper asked for ("Neuer Stapel"): the button that had the focus is gone, so the focus moves here (SC 2.4.3). */
  takeFocus?: boolean;
}) {
  const { deck } = props;
  const [position, setPosition] = useState(0);
  const { saved, error, decide, exit, setExit } = useDecisions(props.onDecide, () =>
    setPosition((p) => p + 1),
  );
  const endTitle = useRef<HTMLHeadingElement>(null);
  const takeFocus = props.takeFocus === true;
  useEffect(() => {
    // The next card, the end card or the empty state: the heading of the new view gets the focus, never the body.
    if (position > 0 || takeFocus)
      (endTitle.current ?? document.getElementById("suggestion-title"))?.focus();
  }, [position, takeFocus]);
  if (deck.empty !== null)
    return (
      <EmptyState
        title={deck.empty.text}
        description={deck.empty.nextAction}
        compact={deck.zoneFilter?.shortfall != null}
        titleRef={endTitle}
        action={{ label: t("deck.propose"), href: CATALOG_ADDRESS }}
      />
    );
  const current = deck.suggestions[position];
  if (current === undefined)
    return (
      <EmptyState
        title={t("deck.end.title", { saved })}
        description={t("deck.end.description")}
        titleRef={endTitle}
        action={{ label: t("deck.newDeck"), onClick: props.onNewDeck }}
      />
    );
  return (
    <div className="flex min-h-[21rem] min-w-0 flex-1 flex-col gap-2">
      <p aria-live="polite" className="m-0 text-center text-sm text-muted-foreground">
        {t("deck.position", { position: position + 1, total: deck.suggestions.length })}
      </p>
      <SwipeCard
        key={current.species}
        exit={exit}
        stamps={STAMPS}
        stacked={position + 1 < deck.suggestions.length}
        onSwipe={setExit}
        onExited={(d) => void decide(current.species, DECISION[d])}
        className="mx-auto flex min-h-48 w-full max-w-md flex-1 basis-0"
      >
        <SuggestionCard suggestion={current} />
      </SwipeCard>
      {error !== null && <Banner variant="error">{error}</Banner>}
      <p className="sr-only">{t("deck.hint")}</p>
      <Actions onDecide={(d) => exit === null && setExit(FLIGHT[d])} />
    </div>
  );
}

export function DeckView(props: Parameters<typeof Cards>[0]) {
  const filter = props.deck.zoneFilter;
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      {filter !== null && <ZoneNotice filter={filter} offerProposal={props.deck.empty === null} />}
      <Cards {...props} />
    </div>
  );
}
