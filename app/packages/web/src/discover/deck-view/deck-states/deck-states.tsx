import type { SuggestionDeck } from "@pflanzendex/core";
import type { RefObject } from "react";
import { EmptyState } from "@/shared/patterns/elements/empty-state/empty-state";
import { Banner } from "@/shared/patterns/states/banner/banner";
import { CATALOG_ADDRESS } from "@/shared/patterns/navigation/navigation/navigation";
import { Button } from "@/shared/ui/button/button";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "../../discover.de.json";

const t = texts(table);

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
