import type { SuggestionDeck } from "@pflanzendex/core";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
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
  );
}

/** One deck, one card at a time; after the last card "Für heute durch" and "Neuer Stapel" (US-ENT-01). */
export function DeckView(props: { deck: SuggestionDeck; onNewDeck: () => void }) {
  const { deck } = props;
  const [position, setPosition] = useState(0);
  useEffect(() => {
    if (position > 0) document.getElementById("suggestion-title")?.focus();
  }, [position]);
  if (deck.empty !== null)
    return (
      <EmptyState
        title={deck.empty.text}
        description={deck.empty.nextAction}
        action={{ label: "Art vorschlagen", href: "/species" }}
      />
    );
  const current = deck.suggestions[position];
  if (current === undefined)
    return (
      <EmptyState
        title={`Für heute durch. ${SAVED} neu auf der Wunschliste.`}
        description="Weitere Vorschläge gibt es mit einem neuen Stapel."
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
      <Actions onDecide={advance} />
      <p className="m-0 text-center text-sm text-muted-foreground">
        Deine Entscheidungen werden noch nicht gespeichert: „Ja“ und „Nein“ blättern vorerst nur
        weiter.
      </p>
    </div>
  );
}
