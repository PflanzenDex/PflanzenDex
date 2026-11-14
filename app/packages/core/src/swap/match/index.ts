// Public interface of the feature `match` (epic TAU): the deck of friends' offers that match the own wishlist.
export { matchDeck, deckOrder, LATER_DAYS } from "./deck";
export type {
  EntryState,
  FitReason,
  MatchCard,
  MatchContext,
  MatchEntry,
  WishlistReason,
} from "./deck";
export type { EmptyReason, MatchCounts } from "./empty";
export { matchYes } from "./answer/yes";
export type { MatchYesResult } from "./answer/yes";
export { matchAnswer, matchUndo, MATCH_ANSWERS } from "./answer/answer";
export type { MatchAnswer } from "./answer/answer";
export type { MatchAnswers, StoredMatchAnswer } from "./answer/types";
export type { BothWaysReason, FriendWishes, MyOffer, MyOffers } from "./both-ways";
