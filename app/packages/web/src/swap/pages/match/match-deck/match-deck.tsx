import type { EmptyReason, MatchCard as Card, MatchEntry } from "@pflanzendex/core";
import { type ReactNode, type Ref } from "react";
import { EmptyState } from "@/shared/patterns/elements/empty-state/empty-state";
import { Banner } from "@/shared/patterns/states/banner/banner";
import { EXCHANGE_PATH } from "@/shared/patterns/navigation/navigation/navigation";
import { SwipeCard } from "@/shared/patterns/elements/swipe-card/swipe-card";
import type { SwipeDirection } from "@/shared/patterns/elements/swipe-card/swipe-gesture";
import { cn } from "@/shared/lib/utils";
import { texts } from "@/shared/lib/text-rules/texts";
import { useLargeText } from "@/shared/patterns/display/card/card-picture/use-large-text";
import table from "../../../swap.de.json";
import { MatchCard } from "../match-card/match-card";
import { AnswerLists } from "./answer-lists/answer-lists";
import { countOf, laterCards, type DeckAction, type DeckState } from "./deck-state";
import { Confirm, Empty, UndoButton, type Answer } from "./match-actions/match-actions";
import { BelowCard } from "./below-card/below-card";
import { DeckHelp } from "./deck-help/deck-help";
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
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      {/* The row is as high as the 44 px target of the info button (SG-TOUCH-01), with no negative margin: the whole target and its
          4 px focus ring stand inside the frame, 4 px clear of the counter text (gap-2) and 4 px clear of the card (the column's
          gap-2). The 24 px of the taller row come from the card and the list region below it; the column gap, 4 px less than
          before at its three gaps, gives 12 of them back (US-QS-15, d-170, issue 2611). */}
      <div className="flex items-center justify-center gap-2">
        <p aria-live="polite" className="m-0 text-center text-sm text-muted-foreground">
          {`Karte ${s.pos + 1} von ${s.round.length}`}
        </p>
        <DeckHelp friend={c.ownerName} />
      </div>
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
        className={cn(
          "mx-auto flex w-full min-w-0 max-w-md",
          !large && "min-h-[18.25rem] flex-1 basis-0",
        )}
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
      <BelowCard c={c} busy={props.busy} answer={props.answer} large={large} lists={props.lists} />
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
  // Follows a text size set after mount (issue 2617, US-QS-32).
  const large = useLargeText();
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
