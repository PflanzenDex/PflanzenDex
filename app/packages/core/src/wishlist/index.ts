// Public interface of the module `wishlist` (ADR 0003): the wish list and its priority by space need (US-WUN-01), the
// purchase and its history (US-WUN-03).
export { wishCandidates } from "./candidates";
export { wishCreate } from "./create";
export { wishRemove, wishRename } from "./repair";
export type { RepairDependencies, WishRemoveResult, WishRenameResult } from "./repair";
export { wishZoneUsage } from "./zone-usage";
export { wishBought, wishBuy } from "./purchase";
export type {
  BoughtDependencies,
  BoughtList,
  BoughtWish,
  BuyWishDependencies,
  WishBuyResult,
} from "./purchase";
export type { WishZoneUsageDependencies } from "./zone-usage";
export type { CreateWishDependencies } from "./create";
export { WISH_LIMITS, WISH_STATUS } from "./types";
export type {
  WishPurchase,
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
  DuplicateWish,
  PriorityKind,
} from "./candidates";
