import type { EmptyReason, MatchCard as Card, MatchEntry } from "@pflanzendex/core";
import type { ReactNode, Ref } from "react";
import { EmptyState } from "@/shared/patterns/elements/empty-state/empty-state";
import { Banner } from "@/shared/patterns/states/banner/banner";
import { EXCHANGE_PATH } from "@/shared/patterns/navigation/navigation/navigation";
import { SwipeCard } from "@/shared/patterns/elements/swipe-card/swipe-card";
import type { SwipeDirection } from "@/shared/patterns/elements/swipe-card/swipe-gesture";
import { texts } from "@/shared/lib/text-rules/texts";
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
            ? "Für jetzt durch."
            : `Für jetzt durch. ${s.requested} angefragt, ${later} für später, ${countOf(s, "no")} abgelehnt.`
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
            : { label: "Anfragen ansehen", href: EXCHANGE_PATH }
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
}) {
  const { s, c, dispatch } = props;
  return (
    <div className="grid min-w-0 gap-3">
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
        className="mx-auto w-full min-w-0 max-w-md"
      >
        <MatchCard card={c} />
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
      <p className="m-0 text-center text-sm text-muted-foreground">
        „Ja“ fragt das Angebot an, „Nein“ und „Später“ bleiben bei dir gespeichert. Der Freund
        erfährt davon nichts. Bei Tauschangeboten ergänzt du die Gegengabe unter Anfragen.
      </p>
      <Actions card={c} busy={props.busy} onAnswer={props.answer} />
      {props.lists}
    </div>
  );
}

/**
 * The match deck, one card at a time (US-TAU-01). "Ja" asks for the offer (US-TAU-03); "Nein" and "Später" are stored
 * privately (US-TAU-02); every answer stays findable in the lists below the card, an ended offer is marked, and only the
 * keeper removes an entry (US-TAU-06).
 */
export function MatchDeck(props: {
  cards: readonly Card[];
  entries: readonly MatchEntry[];
  /** Why there is no card, from the server (US-TAU-07). */
  empty?: EmptyReason | null;
  /** Calm mode: no counters (US-TAU-07, US-ACH-08). */
  calm?: boolean;
  onYes: OnYes;
  onAnswer: OnAnswer;
  onUndo: OnUndo;
}) {
  const { s, dispatch, busy, current, heading, answer, swipe, finish, exit, ask, undo, takeBack } =
    useDeck(props);
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
    />
  );
}
