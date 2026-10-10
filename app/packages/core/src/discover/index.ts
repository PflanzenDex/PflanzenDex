// Public interface of the module `discover` (ADR 0003): the suggestions of the catalog for the wishlist (US-ENT-01).
export { DECK_SIZE, candidatesOf, deckOf, suggestions } from "./suggestions";
export { discoverDecide } from "./decide";
export type { DecideDependencies, DecideResult } from "./decide";
export type {
  NoSuggestions,
  Suggestion,
  SuggestionAttributes,
  SuggestionDeck,
  SuggestionsDependencies,
} from "./suggestions";
