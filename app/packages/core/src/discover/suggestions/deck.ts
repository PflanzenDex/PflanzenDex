// The deck of a request (US-ENT-01, US-ENT-06): pure functions that cut the ranked candidates into decks, spread the
// exploration cards between them and say why a deck is empty (P-09).
import type { ExplorationPick } from "../exploration";
import { DECK_SIZE, type NoSuggestions, type Suggestion, type SuggestionDeck } from "./types";

const NOTHING_LEFT: NoSuggestions = {
  reason: "all_decided",
  text: "Keine neuen Vorschläge: Du besitzt alle Arten des Katalogs oder hast dich schon entschieden.",
  nextAction: "Schlage eine neue Art für den Katalog vor.",
};
export const EMPTY_CATALOG: NoSuggestions = {
  reason: "catalog_empty",
  text: "Keine neuen Vorschläge: Der Katalog hat noch keine Arten.",
  nextAction: "Schlage eine Art für den Katalog vor.",
};
const DECK_DONE: NoSuggestions = {
  reason: "deck_exhausted",
  text: "Keine weiteren Vorschläge: Dieser Stapel ist der letzte.",
  nextAction: "Schlage eine neue Art für den Katalog vor.",
};

/** Pure: deck number `deck` (1-based) of `size` cards, or the reason why there is none. */
export function deckOf(
  candidates: readonly Suggestion[],
  deck: number,
  size: number = DECK_SIZE,
): SuggestionDeck {
  const suggestions = candidates.slice((deck - 1) * size, deck * size);
  if (suggestions.length > 0) return { deck, suggestions, empty: null };
  const reason = deck > 1 && candidates.length > 0 ? DECK_DONE : NOTHING_LEFT;
  return { deck, suggestions, empty: reason };
}

/** Puts the exploration cards between the others, spread over the deck (US-ENT-06). */
function interleave(normal: readonly Suggestion[], explore: readonly Suggestion[]): Suggestion[] {
  const out = [...normal];
  explore.forEach((e, j) => {
    out.splice(Math.round((normal.length * (j + 1)) / (explore.length + 1)) + j, 0, e);
  });
  return out;
}

/**
 * Pure: deck number `deck` with the exploration cards of the plan (US-ENT-06). A deck holds `size` cards, the
 * exploration cards of the deck among them; the others come in rank order, never a species that explores in any deck, so
 * no card shows twice. The same inputs give the same deck (FR-ENT-05).
 */
export function exploringDeckOf(
  candidates: readonly Suggestion[],
  plan: readonly (readonly ExplorationPick[])[],
  deck: number,
  size: number = DECK_SIZE,
): SuggestionDeck {
  const bySpecies = new Map(candidates.map((c) => [c.species, c]));
  const exploring = new Set(plan.flat().map((p) => p.card.species));
  const normal = candidates.filter((c) => !exploring.has(c.species));
  let next = 0;
  let mine: Suggestion[] = [];
  for (let d = 1; d <= deck; d++) {
    const explore = (plan[d - 1] ?? []).flatMap((p) => {
      const c = bySpecies.get(p.card.species);
      return c ? [{ ...c, exploration: true, reasons: [p.reason, ...c.reasons.slice(-1)] }] : [];
    });
    const chunk = normal.slice(next, next + Math.max(0, size - explore.length));
    next += chunk.length;
    if (d === deck) mine = interleave(chunk, explore);
  }
  if (mine.length > 0) return { deck, suggestions: mine, empty: null };
  return {
    deck,
    suggestions: [],
    empty: deck > 1 && candidates.length > 0 ? DECK_DONE : NOTHING_LEFT,
  };
}
