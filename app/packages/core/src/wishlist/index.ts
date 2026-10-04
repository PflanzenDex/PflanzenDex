// Public interface of the module `wishlist` (ADR 0003): the wish list and its priority by space need (US-WUN-01).
export { wishCandidates } from "./candidates";
export { wishCreate } from "./create";
export { wishZoneUsage } from "./zone-usage";
export type { WishZoneUsageDependencies } from "./zone-usage";
export type { CreateWishDependencies } from "./create";
export { WISH_LIMITS, WISH_STATUS } from "./types";
export type {
  WishRow,
  WishStatus,
  WishStore,
  WishValues,
  ZoneStock,
  ZoneStockSource,
} from "./types";
export type {
  Candidate,
  CandidateList,
  CandidatesDependencies,
  PriorityKind,
} from "./candidate-types";
