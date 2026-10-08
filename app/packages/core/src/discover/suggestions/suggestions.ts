// Suggestions (US-ENT-01): the species of the catalog tree that the keeper neither owns nor has a wish for, ordered
// without a score: species of a family the keeper has not caught yet first, then the tree order (FR-ENT-05: same data,
// same deck, same order). Reasons name own data only and carry no percentage (FR-ENT-06, P-08).
import { pokedexOwnership, readCollectorCards, type CollectorCard } from "../../pokedex";
import { wishNameKey } from "../../wishlist";
import {
  DECK_SIZE,
  type NoSuggestions,
  type Suggestion,
  type SuggestionDeck,
  type SuggestionsDependencies,
} from "./types";

const NOTHING_LEFT: NoSuggestions = {
  reason: "all_decided",
  text: "Keine neuen Vorschläge: Du besitzt alle Arten des Katalogs oder hast dich schon entschieden.",
  nextAction: "Schlage eine neue Art für den Katalog vor.",
};
const EMPTY_CATALOG: NoSuggestions = {
  reason: "catalog_empty",
  text: "Keine neuen Vorschläge: Der Katalog hat noch keine Arten.",
  nextAction: "Schlage eine Art für den Katalog vor.",
};
const DECK_DONE: NoSuggestions = {
  reason: "deck_exhausted",
  text: "Keine weiteren Vorschläge: Dieser Stapel ist der letzte.",
  nextAction: "Schlage eine neue Art für den Katalog vor.",
};

function reasonsOf(card: CollectorCard, newFamily: boolean): string[] {
  const reasons = ["Diese Art hast du noch nicht gefangen."];
  if (newFamily && card.family !== null)
    reasons.push(`Neue Familie: ${card.family} fehlt dir noch im Pokédex.`);
  return reasons;
}

function suggestionOf(card: CollectorCard, newFamily: boolean): Suggestion {
  return {
    species: card.species,
    germanName: card.germanName,
    summary: card.summary,
    summaryLanguage: card.summaryLanguage,
    family: card.family,
    lightZone: card.lightZone,
    difficulty: card.difficulty,
    imageUrl: card.imageUrl,
    sourceUrl: card.sourceUrl,
    attributes: { humidity: null, minTemperature: null, toxicToPets: null, growthSize: null },
    reasons: reasonsOf(card, newFamily),
  };
}

/** Pure: the ordered candidates of the account; a species with a wish of any status is excluded (US-ENT-02 reads on). */
export function candidatesOf(
  cards: readonly CollectorCard[],
  wishedNames: readonly string[],
): Suggestion[] {
  const wished = new Set(wishedNames.map(wishNameKey));
  const owned = new Set(cards.filter((c) => c.state === "caught").map((c) => c.family));
  const open = cards.filter((c) => c.state === "missing" && !wished.has(wishNameKey(c.species)));
  const fresh = (c: CollectorCard) => c.family !== null && !owned.has(c.family);
  // Array.prototype.sort is stable, so the tree order stays inside both groups.
  return [...open]
    .sort((a, b) => Number(fresh(b)) - Number(fresh(a)))
    .map((c) => suggestionOf(c, fresh(c)));
}

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

/** Reads the suggestions of the account (P-04): ownership is derived live, the wishes are the only decisions so far. */
export async function suggestions(
  deps: SuggestionsDependencies,
  userId: string,
  timeZone: string,
  deck = 1,
): Promise<SuggestionDeck> {
  const { caught } = await pokedexOwnership(deps.ownership, userId, timeZone);
  const [cards, open, bought, discarded] = await Promise.all([
    readCollectorCards(deps.tree, userId, caught),
    deps.wishes.open(userId),
    deps.wishes.bought(userId),
    deps.wishes.discarded(userId),
  ]);
  if (cards.length === 0) return { deck, suggestions: [], empty: EMPTY_CATALOG };
  const names = [...open, ...bought, ...discarded].map((w) => w.name);
  return deckOf(candidatesOf(cards, names), deck);
}
