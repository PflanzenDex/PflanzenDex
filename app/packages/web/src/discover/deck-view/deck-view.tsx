import type { SuggestionDeck } from "@pflanzendex/core";
import type { RefObject } from "react";
import { Banner } from "@/shared/patterns/states/banner/banner";
import { Button } from "@/shared/ui/button/button";
import { CATALOG_ADDRESS } from "@/shared/patterns/navigation/navigation/navigation";
import { SuggestionCard } from "../suggestion-card/suggestion-card";
import { SwipeCard } from "@/shared/patterns/elements/swipe-card/swipe-card";
import type { SwipeDirection } from "@/shared/patterns/elements/swipe-card/swipe-gesture";
import table from "../discover.de.json";
import { texts } from "@/shared/lib/text-rules/texts";
import { useDecisions, type Decision, type OnDecide, type OnUndo } from "./use-decisions";
import { useDeckPosition } from "./use-deck-position";
import { useDeckKeys } from "./use-deck-keys";
import { Actions, DeckEmpty, DeckEnd, UndoButton } from "./deck-states/deck-states";

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
            <Button asChild variant="outline" size="touch" className="mt-2">
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
        under={next === undefined ? undefined : <SuggestionCard suggestion={next} />}
        onSwipe={props.onSwipe}
        onExited={props.onExited}
        className="mx-auto flex min-h-48 w-full max-w-md flex-1 basis-0"
      >
        <SuggestionCard suggestion={current} titleRef={props.frontTitle} />
      </SwipeCard>
    </>
  );
}

/**
 * One deck as a card stack, one card at a time, with the arrow keys and Backspace while the deck has the focus
 * (US-ENT-10); after the last card "Für heute durch" and "Neuer Stapel" (US-ENT-01). A Yes or No can be taken back with
 * "Rückgängig" (US-ENT-04).
 */
function Cards(props: {
  deck: SuggestionDeck;
  /** Writes "Ja" or "Nein" (US-ENT-04); the card moves on only after it is saved, so nothing is lost silently (P-10). */
  onDecide: OnDecide;
  /** Takes the last Yes or No back (US-ENT-04); the card returns to the deck once it is taken back. */
  onUndo: OnUndo;
  onNewDeck: () => void;
  /** True for a deck the keeper asked for ("Neuer Stapel"): the button that had the focus is gone, so the focus moves here (SC 2.4.3). */
  takeFocus?: boolean;
}) {
  const { deck } = props;
  const { position, moves, endTitle, frontTitle } = useDeckPosition(props.takeFocus === true);
  const { saved, error, taken, decide, undo, exit, setExit, returned } = useDecisions(
    props.onDecide,
    props.onUndo,
    moves,
  );
  const current = deck.empty === null ? deck.suggestions[position] : undefined;
  const fly = (d: SwipeDirection) => exit === null && setExit(d);
  const onKeyDown = useDeckKeys({
    onFly: current === undefined ? undefined : fly,
    onUndo: taken === null ? undefined : () => void undo(),
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
          onUndo={undo}
          onNewDeck={props.onNewDeck}
        />
      </div>
    );
  return (
    // The card and its buttons share the keys of the deck (US-ENT-10).
    <div className="flex min-h-[21rem] min-w-0 flex-1 flex-col gap-2" onKeyDown={onKeyDown}>
      <Stack
        deck={deck}
        position={position}
        exit={exit}
        returned={returned}
        frontTitle={frontTitle}
        onSwipe={setExit}
        onExited={(d) => void decide(current.species, DECISION[d])}
      />
      {error !== null && <Banner variant="error">{error}</Banner>}
      {taken !== null && <UndoButton onClick={undo} />}
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
