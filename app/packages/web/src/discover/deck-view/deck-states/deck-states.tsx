import type { SuggestionDeck } from "@pflanzendex/core";
import { useState, type RefObject } from "react";
import { EmptyState } from "@/shared/patterns/elements/empty-state/empty-state";
import { Banner } from "@/shared/patterns/states/banner/banner";
import { CATALOG_ADDRESS } from "@/shared/patterns/navigation/navigation/navigation";
import { Button } from "@/shared/ui/button/button";
import { texts } from "@/shared/lib/text-rules/texts";
import { cn } from "@/shared/lib/utils";
import type { Decision } from "../use-decisions";
import table from "../../discover.de.json";

const t = texts(table);

/**
 * True when the text size is raised to 150 % or more (US-QS-21, WCAG 1.4.4). Media queries do not follow the root font
 * size, so the row reads it: a sticky row would then cover the card, so it scrolls with the content instead.
 */
function largeText(): boolean {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) >= 24;
}

/** "Nein · Später · Ja" as buttons; they are the way without a swipe gesture (NFR-13). */
export function Actions(props: { onDecide: (d: Decision) => void }) {
  const [large] = useState(largeText);
  return (
    <div
      className={cn(
        // Stays in view with the card (US-QS-14, NFR-13): from 30 rem of window height (the tall window of tokens.css) above
        // the phone bar (3.5 rem plus safe area, a little under the bar's 59 px so no content shows in between), at the
        // window bottom from `md`. Below it the row scrolls like the content, a window too low for a sticky row (400 % zoom).
        "shrink-0 z-10 border-t border-border bg-background py-2",
        !large &&
          "tall-window:sticky tall-window:bottom-[calc(3.5rem+env(safe-area-inset-bottom))] tall-window:md:bottom-0",
        // Large text: the row never sticks, because a sticky row would cover the card. Static content ends under the
        // phone bar otherwise, so the reserve stays while that bar is fixed (the tall window), and goes from `md`.
        large && "tall-window:mb-20 tall-window:md:mb-0",
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

/** "Rückgängig" takes the last Yes or No back (US-ENT-04): a button, the same reach for keyboard and screen reader (NFR-13). */
export function UndoButton(props: { onClick: () => void }) {
  return (
    <div className="text-center">
      <Button variant="outline" size="touch" onClick={props.onClick}>
        {t("deck.undo")}
      </Button>
    </div>
  );
}

/** The end of the deck: the count of new wishes, the take-back of the last Yes or No, and the next deck (US-ENT-01, US-ENT-04). */
export function DeckEnd(props: {
  saved: number;
  error: string | null;
  taken: boolean;
  titleRef: RefObject<HTMLHeadingElement | null>;
  onUndo: () => void;
  onNewDeck: () => void;
}) {
  return (
    <>
      <EmptyState
        title={t("deck.end.title", { saved: props.saved })}
        description={t("deck.end.description")}
        titleRef={props.titleRef}
        action={{ label: t("deck.newDeck"), onClick: props.onNewDeck }}
      />
      {props.error !== null && <Banner variant="error">{props.error}</Banner>}
      {props.taken && <UndoButton onClick={props.onUndo} />}
    </>
  );
}

/** The deck has no card: the reason and the next step (US-ENT-07, P-09). */
export function DeckEmpty(props: {
  empty: NonNullable<SuggestionDeck["empty"]>;
  compact: boolean;
  titleRef: RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <EmptyState
      title={props.empty.text}
      description={props.empty.nextAction}
      compact={props.compact}
      titleRef={props.titleRef}
      action={{ label: t("deck.propose"), href: CATALOG_ADDRESS }}
    />
  );
}
