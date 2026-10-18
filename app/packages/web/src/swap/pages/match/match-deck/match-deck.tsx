import type { MatchCard as Card, MatchEntry } from "@pflanzendex/core";
import type { ReactNode, Ref } from "react";
import { EmptyState } from "@/components/shared/empty-state/empty-state";
import { Banner } from "@/components/shared/states/banner/banner";
import { EXCHANGE_PATH } from "@/components/shared/navigation/nav-model/navigation/navigation";
import { MatchCard } from "../match-card/match-card";
import { AnswerLists } from "./answer-lists/answer-lists";
import { countOf, laterCards, type DeckAction, type DeckState } from "./deck-state";
import { Actions, Confirm, Empty, UndoButton, type Answer } from "./match-actions/match-actions";
import { useDeck, type OnAnswer, type OnUndo, type OnYes } from "./use-deck";

function End(props: {
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
        title={`Für jetzt durch. ${s.requested} angefragt, ${later} für später, ${countOf(s, "no")} abgelehnt.`}
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
      <MatchCard
        key={c.offerId}
        card={c}
        onSwipe={(side) =>
          side === "left" ? props.answer("no") : dispatch({ type: "confirm", on: true })
        }
      />
      {s.confirming && (
        <Confirm
          c={c}
          busy={props.busy}
          onYes={() => props.answer("yes")}
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
  onYes: OnYes;
  onAnswer: OnAnswer;
  onUndo: OnUndo;
}) {
  const { s, dispatch, busy, current, heading, answer, undo, takeBack } = useDeck(props);
  const lists = (
    <AnswerLists
      entries={s.entries}
      busy={busy}
      onShowLater={() => dispatch({ type: "again" })}
      onReconsider={(offerId) => takeBack(offerId, { type: "reconsider", offerId })}
      onRemove={(offerId) => takeBack(offerId, { type: "remove", offerId })}
    />
  );
  if (props.cards.length === 0 && props.entries.length === 0) return <Empty />;
  if (!current)
    return <End s={s} undo={undo} lists={lists} dispatch={dispatch} heading={heading} />;
  return (
    <Current
      s={s}
      c={current}
      busy={busy}
      answer={answer}
      undo={undo}
      lists={lists}
      dispatch={dispatch}
    />
  );
}
