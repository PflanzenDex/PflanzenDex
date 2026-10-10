// Public interface of the module `swap` (ADR 0012).
export { OffersPostgres } from "./offers.ts";
export { SwapsPostgres } from "./swaps.ts";
export type {
  AnswerOutcome,
  AnswerResult,
  FriendOfferRow,
  RequestOutcome,
  RequestResult,
  SwapAction,
  SwapChange,
  SwapRow,
} from "./swaps.ts";
export { FIXTURES_SWAP } from "./fixtures.ts";
