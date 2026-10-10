import type { DecideResult, SuggestionDeck } from "@pflanzendex/core";
import { useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/shared/empty-state/empty-state";
import { Banner } from "@/components/shared/states/banner/banner";
import { Button } from "@/components/ui/button/button";
import { errorText } from "@/lib/error-text";
import type { Response } from "../../kernel";
import { CATALOG_ADDRESS } from "@/components/shared/navigation/nav-model/navigation/navigation";
import { cn } from "@/lib/utils";
import { SuggestionCard } from "../suggestion-card/suggestion-card";

/** What the keeper decided on a card (US-ENT-04): "Ja" and "Nein" are written at once, "Später" writes nothing. */
type Decision = "no" | "later" | "yes";

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

type OnDecide = (species: string, decision: "yes" | "no") => Promise<Response<DecideResult>>;

/**
 * Writes "Ja" and "Nein" (US-ENT-04) and moves on only after the write succeeded; a refusal stays visible and the card
 * stays (P-10). Counts the saved "Ja" of this deck, not the taps. One write at a time.
 */
function useDecisions(onDecide: OnDecide, advance: () => void) {
  const [saved, setSaved] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const decide = async (species: string, d: Decision) => {
    if (busy.current) return;
    if (d === "later") {
      setError(null);
      advance();
      return;
    }
    busy.current = true;
    const r = await onDecide(species, d);
    busy.current = false;
    if (!r.ok) {
      setError(errorText(r.error.code));
      return;
    }
    setError(null);
    if (d === "yes" && r.value.saved) setSaved((n) => n + 1);
    advance();
  };
  return { saved, error, decide };
}

/** One deck, one card at a time; after the last card "Für heute durch" and "Neuer Stapel" (US-ENT-01). */
export function DeckView(props: {
  deck: SuggestionDeck;
  /** Writes "Ja" or "Nein" (US-ENT-04); the card moves on only after it is saved, so nothing is lost silently (P-10). */
  onDecide: OnDecide;
  onNewDeck: () => void;
  /** True for a deck the keeper asked for ("Neuer Stapel"): the button that had the focus is gone, so the focus moves here (SC 2.4.3). */
  takeFocus?: boolean;
}) {
  const { deck } = props;
  const [position, setPosition] = useState(0);
  const { saved, error, decide } = useDecisions(props.onDecide, () => setPosition((p) => p + 1));
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
        title={`Für heute durch. ${saved} neu auf der Wunschliste.`}
        description="Weitere Vorschläge gibt es mit einem neuen Stapel."
        titleRef={endTitle}
        action={{ label: "Neuer Stapel", onClick: props.onNewDeck }}
      />
    );
  return (
    <div className="grid min-w-0 gap-3">
      <p aria-live="polite" className="m-0 text-center text-sm text-muted-foreground">
        {`Vorschlag ${position + 1} von ${deck.suggestions.length}`}
      </p>
      <SuggestionCard
        key={current.species}
        suggestion={current}
        onSwipe={(side) => void decide(current.species, side === "right" ? "yes" : "no")}
      />
      {error !== null && <Banner variant="error">{error}</Banner>}
      <p className="m-0 text-center text-sm text-muted-foreground">
        „Ja“ legt die Art auf die Wunschliste, „Nein“ verwirft sie dort, „Später“ speichert nichts.
      </p>
      <Actions onDecide={(d) => void decide(current.species, d)} />
    </div>
  );
}
