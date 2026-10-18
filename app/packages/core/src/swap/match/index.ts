// Public interface of the feature `match` (epic TAU): the deck of friends' offers that match the own wishlist.
export { matchDeck, deckOrder } from "./deck";
export type { FitReason, MatchCard } from "./deck";
export { matchYes } from "./yes";
export type { MatchYesResult } from "./yes";
export { matchAnswer, matchUndo, MATCH_ANSWERS } from "./answer/answer";
export type { MatchAnswer } from "./answer/answer";
export type { MatchAnswers, StoredMatchAnswer } from "./answer/types";
