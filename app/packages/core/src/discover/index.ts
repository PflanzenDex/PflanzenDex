// Public interface of the module `discover` (ADR 0003): the suggestions of the catalog for the wishlist (US-ENT-01).
export { DECK_SIZE, candidatesOf, deckOf, suggestions } from "./suggestions";
export { discoverDecide } from "./decide";
export type { DecideDependencies, DecideResult } from "./decide";
export type {
  NoSuggestions,
  Suggestion,
  SuggestionAttributes,
  SuggestionDeck,
  SuggestionOptions,
  ZoneFilter,
  SuggestionsDependencies,
} from "./suggestions";
export {
  ATTRIBUTE_FIELDS,
  ATTRIBUTE_LICENSES,
  ATTRIBUTE_SOURCES,
  attributesOf,
  checkAttributeFact,
  sourcesOf,
} from "./attributes";
export type {
  AttributeCheck,
  AttributeFact,
  AttributeField,
  AttributeProblem,
  AttributeSource,
} from "./attributes";
export {
  ATTRIBUTE_FILL_JOB_TYPE,
  deriveGrowthSize,
  GROWTH_SIZE_LIMITS_M,
  orderAttributeFill,
  runAttributeFill,
} from "./attributes/fill";
export type { AttributeFillStore, HeightCandidate } from "./attributes/fill";
