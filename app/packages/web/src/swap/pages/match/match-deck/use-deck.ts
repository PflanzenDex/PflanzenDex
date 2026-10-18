import type { MatchCard as Card, MatchEntry, MatchYesResult } from "@pflanzendex/core";
import { useEffect, useReducer, useRef, useState } from "react";
import { errorText } from "@/lib/error-text";
import type { Response } from "../../../../kernel";
import { cardTitle, deckReducer, initialDeck, type DeckAction } from "./deck-state";
import type { Answer } from "./match-actions/match-actions";

export type OnYes = (offerId: string) => Promise<Response<MatchYesResult>>;
export type OnAnswer = (
  offerId: string,
  answer: "no" | "later",
) => Promise<Response<{ answeredOn: string }>>;
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
      offerId: c.offerId,
      requested: r.value.outcome === "requested",
      notice: YES_NOTICE[r.value.outcome](c),
    };
  if (GONE.has(r.error.code))
    return { type: "gone", notice: `${errorText(r.error.code)} (${title(c)})` };
  return { type: "refused", error: errorText(r.error.code) };
}

/**
 * The writes of the deck (US-TAU-02, US-TAU-03, US-TAU-06): the deck moves on only when the write succeeded, a refusal
 * stays visible (P-10). "Nein" and "Später" are stored privately; `takeBack` removes a stored answer (undo, "Wieder
 * ansehen", "Aus der Liste entfernen").
 */
export function useDeck(props: {
  cards: readonly Card[];
  entries: readonly MatchEntry[];
  onYes: OnYes;
  onAnswer: OnAnswer;
  onUndo: OnUndo;
}) {
  const [s, dispatch] = useReducer(deckReducer, undefined, () =>
    initialDeck(props.cards, props.entries),
  );
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    // The next card or the end view: its heading gets the focus, never the page body (SC 2.4.3).
    if (s.moved) (heading.current ?? document.getElementById("match-title"))?.focus();
  }, [s.pos, s.round, s.moved]);
  const current = s.round[s.pos];
  const run = (write: () => Promise<DeckAction>) => {
    setBusy(true);
    void write().then((action) => {
      setBusy(false);
      dispatch(action);
    });
  };
  const store = (c: Card, a: "no" | "later"): Promise<DeckAction> =>
    props.onAnswer(c.offerId, a).then((r) => {
      if (!r.ok) return { type: "refused", error: errorText(r.error.code) };
      const answeredOn = r.value.answeredOn;
      return a === "no"
        ? {
            type: "no",
            card: c,
            answeredOn,
            notice: `Nein: ${title(c)}. Der Freund erfährt davon nichts.`,
          }
        : {
            type: "later",
            card: c,
            answeredOn,
            notice: `Später: ${title(c)}. Du findest die Karte unter „Später ansehen“.`,
          };
    });
  const answer = (a: Answer) => {
    if (!current || busy) return;
    if (a === "yes") return run(() => askFor(current, props.onYes));
    run(() => store(current, a));
  };
  const takeBack = (offerId: string, done: DeckAction) => {
    if (busy) return;
    run(() =>
      props
        .onUndo(offerId)
        .then((r) => (r.ok ? done : { type: "refused", error: errorText(r.error.code) })),
    );
  };
  const last = s.round[s.pos - 1];
  const undo = () => last && takeBack(last.offerId, { type: "undo" });
  return { s, dispatch, busy, current, heading, answer, undo, takeBack };
}
