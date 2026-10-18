import type { MatchCard as Card, MatchEntry } from "@pflanzendex/core";

/** The state of the deck (US-TAU-01/02/06): where the keeper is, the stored answers and what the last write said. */
export interface DeckState {
  readonly round: readonly Card[];
  readonly pos: number;
  /** The stored answers No and Later with the state of their offer (US-TAU-06); the lists are derived from it. */
  readonly entries: readonly MatchEntry[];
  readonly requested: number;
  /** The last answer that can still be taken back (No or Later, US-TAU-02); a Yes is withdrawn in "Requests". */
  readonly last: "no" | "later" | null;
  readonly notice: string | null;
  readonly error: string | null;
  readonly confirming: boolean;
  /** True once the keeper moved, so the focus follows to the new view (SC 2.4.3). */
  readonly moved: boolean;
}

export type DeckAction =
  | { type: "no"; card: Card; answeredOn: string; notice: string }
  | { type: "later"; card: Card; answeredOn: string; notice: string }
  | { type: "yes"; offerId: string; requested: boolean; notice: string }
  | { type: "gone"; notice: string }
  | { type: "refused"; error: string }
  | { type: "confirm"; on: boolean }
  | { type: "undo" }
  | { type: "reconsider"; offerId: string }
  | { type: "remove"; offerId: string }
  | { type: "again" };

export const initialDeck = (
  cards: readonly Card[],
  entries: readonly MatchEntry[] = [],
): DeckState => ({
  round: cards,
  pos: 0,
  entries,
  requested: 0,
  last: null,
  notice: null,
  error: null,
  confirming: false,
  moved: false,
});

/** The cards answered with "Später" that can be decided now. */
export const laterCards = (s: Pick<DeckState, "entries">): readonly Card[] =>
  s.entries.flatMap((e) => (e.answer === "later" && e.card ? [e.card] : []));

/** Number of entries answered with the given answer. */
export const countOf = (s: Pick<DeckState, "entries">, answer: "no" | "later") =>
  s.entries.filter((e) => e.answer === answer).length;

/** Moves on to the next card with a notice; the error of an earlier try is gone. */
const next = (s: DeckState, notice: string, last: DeckState["last"]): DeckState => ({
  ...s,
  pos: s.pos + 1,
  notice,
  last,
  error: null,
  confirming: false,
  moved: true,
});

const without = (entries: readonly MatchEntry[], offerId: string) =>
  entries.filter((e) => e.offerId !== offerId);

/** The entry a stored answer creates; a card that is shown is an open one (US-TAU-06). */
const entryOf = (card: Card, answer: "no" | "later", answeredOn: string): MatchEntry => ({
  offerId: card.offerId,
  answer,
  answeredOn,
  speciesLatin: card.speciesLatin,
  speciesGerman: card.speciesGerman,
  giverName: card.ownerName,
  state: "open",
  card,
});

const stored = (s: DeckState, card: Card, answer: "no" | "later", answeredOn: string) => [
  ...without(s.entries, card.offerId),
  entryOf(card, answer, answeredOn),
];

function undo(s: DeckState): DeckState {
  const card = s.round[s.pos - 1];
  if (s.last === null || !card) return s;
  return {
    ...s,
    pos: s.pos - 1,
    entries: without(s.entries, card.offerId),
    last: null,
    notice: null,
    moved: true,
  };
}

/** The offer is a card again: it is put at the end of the deck, so the keeper sees it after the rest (US-TAU-06). */
function reconsider(s: DeckState, offerId: string): DeckState {
  const card = s.entries.find((e) => e.offerId === offerId)?.card;
  const rest = without(s.entries, offerId);
  if (!card) return { ...s, entries: rest };
  return {
    ...s,
    entries: rest,
    round: [...s.round, card],
    notice: null,
    error: null,
    moved: true,
  };
}

/** Pure transitions of the deck, so every rule is testable without the screen (P-02). */
export function deckReducer(s: DeckState, a: DeckAction): DeckState {
  switch (a.type) {
    case "no":
      return next({ ...s, entries: stored(s, a.card, "no", a.answeredOn) }, a.notice, "no");
    case "later":
      return next({ ...s, entries: stored(s, a.card, "later", a.answeredOn) }, a.notice, "later");
    case "yes":
      return next(
        {
          ...s,
          requested: s.requested + (a.requested ? 1 : 0),
          entries: without(s.entries, a.offerId),
        },
        a.notice,
        null,
      );
    case "gone":
      return next(s, a.notice, null);
    case "refused":
      return { ...s, error: a.error, last: null };
    case "confirm":
      return { ...s, confirming: a.on };
    case "undo":
      return undo(s);
    case "reconsider":
      return reconsider(s, a.offerId);
    case "remove":
      return { ...s, entries: without(s.entries, a.offerId) };
    case "again": {
      // The Later cards first, then the cards not yet decided (none at the end of the deck), each card once.
      const rest = s.round.slice(s.pos);
      const first = laterCards(s).filter((c) => !rest.some((r) => r.offerId === c.offerId));
      return {
        ...initialDeck([...first, ...rest], s.entries),
        requested: s.requested,
        moved: true,
      };
    }
  }
}

/** The name a card goes by: German name, else Latin, else "unknown" (P-08). */
export const cardTitle = (c: Card) => c.speciesGerman ?? c.speciesLatin ?? "Art unbekannt";
