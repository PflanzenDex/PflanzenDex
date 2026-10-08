import type { SuggestionDeck } from "@pflanzendex/core";
import { useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/shared/empty-state/empty-state";
import { Button } from "@/components/ui/button";
import { CATALOG_ADDRESS } from "@/navigation";
import { cn } from "@/lib/utils";
import { SuggestionCard } from "../suggestion-card/suggestion-card";

/**
 * What the keeper decided on a card. "Ja" and "Nein" are not saved yet (US-ENT-04 writes them); until then they only
 * move on, and the view says so (P-10).
 */
type Decision = "no" | "later" | "yes";

/** Wishes saved by this deck. Nothing is saved before US-ENT-04, so this is honestly 0, not the number of taps. */
const SAVED = 0;

/** "Nein · Später · Ja" as buttons; they are the way without a swipe gesture (NFR-13). */
function Actions(props: { onDecide: (d: Decision) => void }) {
  return (
    <div
      className={cn(
        // Stays in view with the card (US-QS-14, NFR-13): above the phone bar (3.5 rem plus safe area, a little under
        // the bar's 59 px so no content shows in between), at the window bottom from `md`. A window too low for it
        // (400 % zoom) scrolls it like content.
        "sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10 border-t border-border bg-background py-2",
        "md:bottom-0 [@media(max-height:30rem)]:static",
      )}
    >
      <div className="mx-auto flex w-full max-w-md gap-2">
        <Button
          variant="outline"
          size="touch"
          className="flex-1"
          onClick={() => props.onDecide("no")}
        >
          Nein
        </Button>
        <Button
          variant="secondary"
          size="touch"
          className="flex-1"
          onClick={() => props.onDecide("later")}
        >
          Später
        </Button>
        <Button size="touch" className="flex-1" onClick={() => props.onDecide("yes")}>
          Ja
        </Button>
      </div>
    </div>
  );
}

/** One deck, one card at a time; after the last card "Für heute durch" and "Neuer Stapel" (US-ENT-01). */
export function DeckView(props: {
  deck: SuggestionDeck;
  onNewDeck: () => void;
  /** True for a deck the keeper asked for ("Neuer Stapel"): the button that had the focus is gone, so the focus moves here (SC 2.4.3). */
  takeFocus?: boolean;
}) {
  const { deck } = props;
  const [position, setPosition] = useState(0);
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
        titleRef={endTitle}
        action={{ label: "Art vorschlagen", href: CATALOG_ADDRESS }}
      />
    );
  const current = deck.suggestions[position];
  if (current === undefined)
    return (
      <EmptyState
        title={`Für heute durch. ${SAVED} neu auf der Wunschliste.`}
        description="Weitere Vorschläge gibt es mit einem neuen Stapel."
        titleRef={endTitle}
        action={{ label: "Neuer Stapel", onClick: props.onNewDeck }}
      />
    );
  const advance = () => setPosition((p) => p + 1);
  return (
    <div className="grid min-w-0 gap-3">
      <p aria-live="polite" className="m-0 text-center text-sm text-muted-foreground">
        {`Vorschlag ${position + 1} von ${deck.suggestions.length}`}
      </p>
      <SuggestionCard key={current.species} suggestion={current} onSwipe={advance} />
      <p className="m-0 text-center text-sm text-muted-foreground">
        Deine Entscheidungen werden noch nicht gespeichert: „Ja“ und „Nein“ blättern vorerst nur
        weiter.
      </p>
      <Actions onDecide={advance} />
    </div>
  );
}
