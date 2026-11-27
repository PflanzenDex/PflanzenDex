import type { SuggestionDeck } from "@pflanzendex/core";
import { useState, type RefObject } from "react";
import { Banner } from "@/shared/patterns/states/banner/banner";
import { Button } from "@/shared/ui/button";
import { CATALOG_ADDRESS } from "@/shared/patterns/navigation/navigation/navigation";
import { SuggestionCard } from "../suggestion-card/suggestion-card";
import { SwipeCard } from "@/shared/patterns/elements/swipe-card/swipe-card";
import type { SwipeDirection } from "@/shared/patterns/elements/swipe-card/swipe-gesture";
import table from "../discover.de.json";
import { texts } from "@/shared/lib/text-rules/texts";
import { cn } from "@/shared/lib/utils";
import { useDecisions, type Decision, type OnDecide, type OnUndo } from "./use-decisions";
import { useDeckPosition } from "./use-deck-position";
import { useDeckKeys } from "./use-deck-keys";
import { Actions, DeckEmpty, DeckEnd, UndoButton } from "./deck-states/deck-states";
import { largeText } from "@/shared/patterns/display/card/card-picture/large-text";

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
            <Button asChild variant="tinted" size="touch" className="mt-2">
              <a href={CATALOG_ADDRESS}>{t("deck.propose")}</a>
            </Button>
          )}
        </Banner>
      )}
    </div>
  );
}

/**
 * The card stack (US-ENT-10): "Karte n von m" in text, the top card and up to two below it; the next card waits
 * underneath with its content (aria-hidden, inert). A card taken back comes in from the side it left.
 */
function Stack(props: {
  deck: SuggestionDeck;
  position: number;
  exit: SwipeDirection | null;
  returned: SwipeDirection | null;
  frontTitle: RefObject<HTMLHeadingElement | null>;
  onSwipe: (d: SwipeDirection) => void;
  onExited: (d: SwipeDirection) => void;
  /** Large text: the card takes its own height and the deck scrolls as a whole (US-QS-32). */
  large: boolean;
}) {
  const { suggestions } = props.deck;
  const current = suggestions[props.position];
  const next = suggestions[props.position + 1];
  if (current === undefined) return null;
  return (
    <>
      <p aria-live="polite" className="m-0 text-center text-sm text-muted-foreground">
        {t("deck.position", { position: props.position + 1, total: suggestions.length })}
      </p>
      <SwipeCard
        key={current.species}
        exit={props.exit}
        stamps={STAMPS}
        depth={suggestions.length - props.position - 1}
        enterFrom={props.returned}
        under={next && <SuggestionCard suggestion={next} fill={!props.large} preview />}
        onSwipe={props.onSwipe}
        onExited={props.onExited}
        className={cn(
          "mx-auto flex w-full max-w-md",
          props.large ? "flex-none" : "min-h-[16.5rem] flex-1 basis-0",
        )}
      >
        <SuggestionCard suggestion={current} titleRef={props.frontTitle} fill={!props.large} />
      </SwipeCard>
    </>
  );
}

/**
 * The column of the deck: at the normal size it keeps the height of one card and the card fills the free height, so the
 * deck fits one screen; at large text it takes its own height and the page scrolls (US-QS-32, SG-TYPE-04).
 */
const deckColumn = (large: boolean) =>
  cn("flex min-w-0 flex-col gap-2", !large && "min-h-[21rem] flex-1");

/**
 * One deck as a card stack, one card at a time, with the arrow keys and Backspace while the deck has the focus
 * (US-ENT-10); after the last card "Für heute durch" and "Neuer Stapel" (US-ENT-01). A Yes or No can be taken back with
 * "Rückgängig" (US-ENT-04).
 */
function Cards(props: {
  deck: SuggestionDeck;
  /** Writes "Wünschen" or "Kein Interesse" (US-ENT-04); the card moves on only after it is saved, so nothing is lost silently (P-10). */
  onDecide: OnDecide;
  /** Takes the last Yes or No back (US-ENT-04); the card returns to the deck once it is taken back. */
  onUndo: OnUndo;
  onNewDeck: () => void;
  /** True for a deck the keeper asked for ("Neuer Stapel"): the button that had the focus is gone, so the focus moves here (SC 2.4.3). */
  takeFocus?: boolean;
}) {
  const { deck } = props;
  const { position, moves, endTitle, frontTitle } = useDeckPosition(props.takeFocus === true);
  const { saved, error, taken, decide, exit, returned, fly, takeBack } = useDecisions(
    props.onDecide,
    props.onUndo,
    moves,
  );
  // Read once, as the decision row does: a text size set while the deck is open takes effect with the next deck.
  const [large] = useState(largeText);
  const current = deck.empty === null ? deck.suggestions[position] : undefined;
  const onKeyDown = useDeckKeys({
    onFly: current === undefined ? undefined : fly,
    onUndo: taken === null ? undefined : takeBack,
  });
  if (deck.empty !== null)
    return (
      <DeckEmpty
        empty={deck.empty}
        compact={deck.zoneFilter?.shortfall != null}
        titleRef={endTitle}
      />
    );
  if (current === undefined)
    return (
      // The keys of the deck act where the deck has the focus: here Backspace for "Rückgängig" (US-ENT-10).
      <div className="contents" onKeyDown={onKeyDown}>
        <DeckEnd
          saved={saved}
          error={error}
          taken={taken !== null}
          titleRef={endTitle}
          onUndo={takeBack}
          onNewDeck={props.onNewDeck}
        />
      </div>
    );
  return (
    // The card and its buttons share the keys of the deck (US-ENT-10).
    <div className={deckColumn(large)} onKeyDown={onKeyDown}>
      <Stack
        deck={deck}
        position={position}
        exit={exit}
        returned={returned}
        frontTitle={frontTitle}
        onSwipe={fly}
        onExited={(d) => void decide(current.species, DECISION[d])}
        large={large}
      />
      {error !== null && <Banner variant="error">{error}</Banner>}
      {taken !== null && <UndoButton onClick={takeBack} />}
      <p className="sr-only">{t("deck.hint")}</p>
      <Actions onDecide={(d) => fly(FLIGHT[d])} />
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
