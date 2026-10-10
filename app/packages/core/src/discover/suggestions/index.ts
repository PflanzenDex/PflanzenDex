// Public interface of the feature `suggestions` (US-ENT-01).
export { candidatesOf, suggestions } from "./suggestions";
export { deckOf } from "./deck";
export { DECK_SIZE, EXPLORATION_PER_DECK } from "./types";
export type {
  NoSuggestions,
  Suggestion,
  SuggestionAttributes,
  SuggestionDeck,
  SuggestionOptions,
  ZoneFilter,
  SuggestionsDependencies,
} from "./types";
