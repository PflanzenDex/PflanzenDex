import type { MatchCard as Card } from "@pflanzendex/core";

/** The session state of the deck (US-TAU-01/02): where the keeper is, what was put aside and what the last write said. */
export interface DeckState {
  readonly round: readonly Card[];
  readonly pos: number;
  readonly later: readonly Card[];
  readonly declined: number;
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
  | { type: "no"; notice: string }
  | { type: "later"; card: Card; notice: string }
  | { type: "yes"; requested: boolean; notice: string }
  | { type: "gone"; notice: string }
  | { type: "refused"; error: string }
  | { type: "confirm"; on: boolean }
  | { type: "undo" }
  | { type: "again" };

export const initialDeck = (cards: readonly Card[], later: readonly Card[] = []): DeckState => ({
  round: cards,
  pos: 0,
  later,
  declined: 0,
  requested: 0,
  last: null,
  notice: null,
  error: null,
  confirming: false,
  moved: false,
});

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

function undo(s: DeckState): DeckState {
  if (s.last === null || s.pos === 0) return s;
  return {
    ...s,
    pos: s.pos - 1,
    later: s.last === "later" ? s.later.slice(0, -1) : s.later,
    declined: s.last === "no" ? s.declined - 1 : s.declined,
    last: null,
    notice: null,
    moved: true,
  };
}

/** Pure transitions of the deck, so every rule is testable without the screen (P-02). */
export function deckReducer(s: DeckState, a: DeckAction): DeckState {
  switch (a.type) {
    case "no":
      return next({ ...s, declined: s.declined + 1 }, a.notice, "no");
    case "later":
      return next({ ...s, later: [...s.later, a.card] }, a.notice, "later");
    case "yes":
      return next({ ...s, requested: s.requested + (a.requested ? 1 : 0) }, a.notice, null);
    case "gone":
      return next(s, a.notice, null);
    case "refused":
      return { ...s, error: a.error, last: null };
    case "confirm":
      return { ...s, confirming: a.on };
    case "undo":
      return undo(s);
    case "again":
      // The Later cards first, then the cards not yet decided (none at the end of the deck).
      return { ...initialDeck([...s.later, ...s.round.slice(s.pos)]), moved: true };
  }
}

/** The name a card goes by: German name, else Latin, else "unknown" (P-08). */
export const cardTitle = (c: Card) => c.speciesGerman ?? c.speciesLatin ?? "Art unbekannt";
