import type { MatchCard as Card, MatchYesResult } from "@pflanzendex/core";
import { useEffect, useReducer, useRef, useState, type Ref } from "react";
import { EmptyState } from "@/components/shared/empty-state/empty-state";
import { Banner } from "@/components/shared/states/banner/banner";
import { EXCHANGE_PATH } from "@/components/shared/navigation/nav-model/navigation/navigation";
import { errorText } from "@/lib/error-text";
import type { Response } from "../../../../kernel";
import { MatchCard } from "../match-card/match-card";
import { cardTitle, deckReducer, initialDeck, type DeckAction, type DeckState } from "./deck-state";
import {
  Actions,
  Confirm,
  Empty,
  LaterSection,
  UndoButton,
  type Answer,
} from "./match-actions/match-actions";

export type OnYes = (offerId: string) => Promise<Response<MatchYesResult>>;
export type OnAnswer = (offerId: string, answer: "no" | "later") => Promise<Response<unknown>>;
export type OnUndo = (offerId: string) => Promise<Response<unknown>>;

const title = cardTitle;

/** What a Yes answered: the request exists, or it existed already (US-TAU-03); the offer is gone: the reason stays visible (P-10). */
const YES_NOTICE: Record<MatchYesResult["outcome"], (c: Card) => string> = {
  requested: (c) =>
    `Angefragt: ${title(c)} von ${c.ownerName ?? "einem Freund"}. Unter Anfragen kannst du sie verfolgen.`,
  already_requested: (c) => `Schon angefragt: ${title(c)}.`,
};

/** Codes that mean the offer cannot be asked for any more; the card then moves on with the reason instead of staying (US-TAU-03). */
const GONE = new Set(["offer.not_active", "offer.not_found"]);

/** Asks for the offer and turns the answer into a deck action; a refusal that is not "gone" keeps the card (P-10). */
async function askFor(c: Card, onYes: OnYes): Promise<DeckAction> {
  const r = await onYes(c.offerId);
  if (r.ok)
    return {
      type: "yes",
      requested: r.value.outcome === "requested",
      notice: YES_NOTICE[r.value.outcome](c),
    };
  if (GONE.has(r.error.code))
    return { type: "gone", notice: `${errorText(r.error.code)} (${title(c)})` };
  return { type: "refused", error: errorText(r.error.code) };
}

function End(props: {
  s: DeckState;
  undo: () => void;
  dispatch: (a: DeckAction) => void;
  heading: Ref<HTMLHeadingElement>;
}) {
  const { s, dispatch } = props;
  const later = s.later.length;
  return (
    <div className="grid gap-3">
      {s.notice !== null && (
        <p role="status" className="m-0 text-center text-sm">
          {s.notice}
        </p>
      )}
      <EmptyState
        title={`Für jetzt durch. ${s.requested} angefragt, ${later} für später, ${s.declined} abgelehnt.`}
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
    </div>
  );
}

function Current(props: {
  s: DeckState;
  c: Card;
  busy: boolean;
  answer: (a: Answer) => void;
  undo: () => void;
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
      <LaterSection cards={s.later} onShow={() => dispatch({ type: "again" })} />
      <Actions card={c} busy={props.busy} onAnswer={props.answer} />
    </div>
  );
}

/**
 * The match deck, one card at a time (US-TAU-01). "Ja" asks for the offer (US-TAU-03) and the card moves on only after the
 * write was answered; a refusal stays visible (P-10). "Nein" and "Später" are stored privately and the card moves on
 * only after they were stored (US-TAU-02, DM-TAU-01); "Rückgängig" takes the last one back. Cards answered with "Später"
 * stay findable in their own section (P-10).
 */
export function MatchDeck(props: {
  cards: readonly Card[];
  later: readonly Card[];
  onYes: OnYes;
  onAnswer: OnAnswer;
  onUndo: OnUndo;
}) {
  const [s, dispatch] = useReducer(deckReducer, undefined, () =>
    initialDeck(props.cards, props.later),
  );
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    // The next card or the end view: its heading gets the focus, never the page body (SC 2.4.3).
    if (s.moved) (heading.current ?? document.getElementById("match-title"))?.focus();
  }, [s.pos, s.round, s.moved]);
  const current = s.round[s.pos];
  /** Runs one write; the deck moves on only when it succeeded, a refusal stays visible (P-10). */
  const run = (write: () => Promise<DeckAction>) => {
    setBusy(true);
    void write().then((action) => {
      setBusy(false);
      dispatch(action);
    });
  };
  const store = (c: Card, a: "no" | "later"): Promise<DeckAction> =>
    props.onAnswer(c.offerId, a).then((r) =>
      r.ok
        ? a === "no"
          ? { type: "no", notice: `Nein: ${title(c)}. Der Freund erfährt davon nichts.` }
          : {
              type: "later",
              card: c,
              notice: `Später: ${title(c)}. Du findest die Karte unter „Später ansehen“.`,
            }
        : { type: "refused", error: errorText(r.error.code) },
    );
  const answer = (a: Answer) => {
    if (!current || busy) return;
    if (a === "yes") return run(() => askFor(current, props.onYes));
    run(() => store(current, a));
  };
  const undo = () => {
    const last = s.round[s.pos - 1];
    if (!last || busy) return;
    run(() =>
      props
        .onUndo(last.offerId)
        .then((r) =>
          r.ok ? { type: "undo" } : { type: "refused", error: errorText(r.error.code) },
        ),
    );
  };
  if (props.cards.length === 0 && props.later.length === 0) return <Empty />;
  if (!current) return <End s={s} undo={undo} dispatch={dispatch} heading={heading} />;
  return <Current s={s} c={current} busy={busy} answer={answer} undo={undo} dispatch={dispatch} />;
}
