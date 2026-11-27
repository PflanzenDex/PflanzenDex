import type { EmptyReason, MatchCard as Card, MatchEntry } from "@pflanzendex/core";
import { useState, type ReactNode, type Ref } from "react";
import { EmptyState } from "@/shared/patterns/elements/empty-state/empty-state";
import { Banner } from "@/shared/patterns/states/banner/banner";
import { MoreHelp } from "@/shared/ui/more-help";
import { EXCHANGE_PATH } from "@/shared/patterns/navigation/navigation/navigation";
import { SwipeCard } from "@/shared/patterns/elements/swipe-card/swipe-card";
import type { SwipeDirection } from "@/shared/patterns/elements/swipe-card/swipe-gesture";
import { cn } from "@/shared/lib/utils";
import { ScrollRegion } from "@/shared/patterns/responsive/pager/paging/scroll-entries/scroll-region/scroll-region";
import { texts } from "@/shared/lib/text-rules/texts";
import { largeText } from "@/shared/patterns/display/card/card-picture/large-text";
import table from "../../../swap.de.json";
import { MatchCard } from "../match-card/match-card";
import { AnswerLists } from "./answer-lists/answer-lists";
import { countOf, laterCards, type DeckAction, type DeckState } from "./deck-state";
import { Actions, Confirm, Empty, UndoButton, type Answer } from "./match-actions/match-actions";
import { useDeck, type OnAnswer, type OnUndo, type OnYes } from "./use-deck";

const t = texts(table);

/** The stamps show the texts of the buttons (US-TAU-02). */
const STAMPS: Record<SwipeDirection, string> = {
  left: t("stamp.no"),
  right: t("stamp.yes"),
  up: t("stamp.later"),
  down: t("stamp.later"),
};

function End(props: {
  calm: boolean;
  s: DeckState;
  undo: () => void;
  lists: ReactNode;
  dispatch: (a: DeckAction) => void;
  heading: Ref<HTMLHeadingElement>;
}) {
  const { s, dispatch } = props;
  const later = laterCards(s).length;
  return (
    <div className="grid gap-3">
      {s.notice !== null && (
        <p role="status" className="m-0 text-center text-sm">
          {s.notice}
        </p>
      )}
      <EmptyState
        title={
          // Calm mode: no counters (US-TAU-07, US-ACH-08).
          props.calm
            ? "Für jetzt durch"
            : `Für jetzt durch: ${s.requested} angefragt, ${later} für später, ${countOf(s, "no")} abgelehnt`
        }
        description={
          later > 0
            ? "Die Karten für später kannst du jetzt noch einmal ansehen. Anfragen verfolgst du in der Tauschbörse."
            : "Deine Anfragen verfolgst du in der Tauschbörse. Neue passende Angebote erscheinen hier von selbst."
        }
        titleRef={props.heading}
        action={
          later > 0
            ? { label: "Später-Karten ansehen", onClick: () => dispatch({ type: "again" }) }
            : { label: "Anfragen ansehen", href: `${EXCHANGE_PATH}?part=requests` }
        }
      />
      {s.last !== null && <UndoButton onClick={props.undo} />}
      {props.lists}
    </div>
  );
}

function Current(props: {
  s: DeckState;
  c: Card;
  busy: boolean;
  answer: (a: Answer) => void;
  /** The card's drag ended past the threshold (US-TAU-02). */
  swipe: (d: SwipeDirection) => void;
  /** The card has left the screen: the answer is written (US-TAU-02). */
  finish: (d: SwipeDirection) => void;
  /** The direction the card flies to while its answer is written. */
  exit: SwipeDirection | null;
  ask: (counter: string | null) => void;
  undo: () => void;
  lists: ReactNode;
  dispatch: (a: DeckAction) => void;
  /** Large text (US-QS-32): the row of decision buttons does not stick, because it would cover the card. */
  large: boolean;
}) {
  const { s, c, dispatch, large } = props;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <p aria-live="polite" className="m-0 text-center text-sm text-muted-foreground">
        {`Karte ${s.pos + 1} von ${s.round.length}`}
      </p>
      {s.notice !== null && (
        <p role="status" className="m-0 text-center text-sm">
          {s.notice}
        </p>
      )}
      <SwipeCard
        key={c.offerId}
        exit={props.exit}
        stamps={STAMPS}
        stacked={s.pos + 1 < s.round.length}
        disabled={props.busy}
        onSwipe={props.swipe}
        onExited={props.finish}
        className={cn("mx-auto flex w-full min-w-0 max-w-md", !large && "min-h-48 flex-1 basis-0")}
      >
        <MatchCard card={c} fill={!large} />
      </SwipeCard>
      {s.confirming && (
        <Confirm
          c={c}
          busy={props.busy}
          onYes={props.ask}
          onCancel={() => dispatch({ type: "confirm", on: false })}
        />
      )}
      {s.error !== null && <Banner variant="error">{s.error}</Banner>}
      {s.last !== null && <UndoButton onClick={props.undo} />}
      {/* One line above the buttons (SG-COPY-05, US-QS-32, F-0279); the rest sits behind Mehr erfahren. */}
      <MoreHelp className="text-center" more={t("deck.askMore")}>
        {c.ownerName ?? t("deck.friendFallback")} erfährt nur von einer Anfrage.
      </MoreHelp>
      <Actions card={c} busy={props.busy} onAnswer={props.answer} large={large} />
      {/* The answers below the deck scroll in a region of their own, so they never take the room of the card (US-QS-15, issue 2421). */}
      <ScrollRegion label={t("deck.listsLabel")} className="max-h-36 flex-none">
        {props.lists}
      </ScrollRegion>
    </div>
  );
}

/**
 * The match deck, one card at a time (US-TAU-01). "Anfragen" asks for the offer (US-TAU-03); "Ablehnen" and "Später" are stored
 * privately (US-TAU-02); every answer stays findable in the lists below the card, an ended offer is marked, and only the
 * keeper removes an entry (US-TAU-06).
 */
export function MatchDeck(props: {
  cards: readonly Card[];
  entries: readonly MatchEntry[];
  /** Why there is no card, from the server (US-TAU-07). */
  empty?: EmptyReason | null;
  /** My open requests on matching offers, from the server, so the summary survives a reload (US-TAU-02). */
  requested?: number;
  /** Calm mode: no counters (US-TAU-07, US-ACH-08). */
  calm?: boolean;
  onYes: OnYes;
  onAnswer: OnAnswer;
  onUndo: OnUndo;
}) {
  const { s, dispatch, busy, current, heading, answer, swipe, finish, exit, ask, undo, takeBack } =
    useDeck(props);
  // Read once, as the discover deck does: a text size set while the deck is open takes effect with the next deck (US-QS-32).
  const [large] = useState(largeText);
  const lists = (
    <AnswerLists
      entries={s.entries}
      busy={busy}
      onShowLater={() => dispatch({ type: "again" })}
      onReconsider={(offerId) => takeBack(offerId, { type: "reconsider", offerId })}
      onRemove={(offerId) => takeBack(offerId, { type: "remove", offerId })}
    />
  );
  if (props.cards.length === 0 && props.entries.length === 0)
    return <Empty reason={props.empty ?? null} />;
  if (!current)
    return (
      <End
        calm={props.calm ?? false}
        s={s}
        undo={undo}
        lists={lists}
        dispatch={dispatch}
        heading={heading}
      />
    );
  return (
    <Current
      s={s}
      c={current}
      busy={busy}
      answer={answer}
      swipe={swipe}
      finish={finish}
      exit={exit}
      ask={ask}
      undo={undo}
      lists={lists}
      dispatch={dispatch}
      large={large}
    />
  );
}
