// Public interface of the feature `purchase` (US-WUN-03, US-WUN-05): record a purchase, read the bought wishes, link a
// bought wish to its specimen and discard a wish.
export { wishBuy } from "./buy";
export type { BuyWishDependencies, WishBuyResult } from "./buy";
export { wishBought } from "./bought";
export type { BoughtDependencies, BoughtList, BoughtWish } from "./bought";
// What follows a purchase (US-WUN-05): link a bought wish to its specimen, discard a wish.
export { wishDiscard, wishDiscarded, wishLinkSpecimen } from "./after-purchase";
export type {
  DiscardDependencies,
  DiscardedDependencies,
  DiscardedList,
  DiscardedWish,
  LinkDependencies,
  WishDiscardResult,
  WishLinkResult,
} from "./after-purchase";
