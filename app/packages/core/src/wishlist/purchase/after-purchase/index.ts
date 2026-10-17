// Public interface of the feature `after-purchase` (US-WUN-05): link a bought wish to its specimen, discard a wish.
export { wishDiscard } from "./discard";
export type { DiscardDependencies, WishDiscardResult } from "./discard";
export { wishDiscarded } from "./discarded";
export type { DiscardedDependencies, DiscardedList, DiscardedWish } from "./discarded";
export { wishLinkSpecimen } from "./link";
export type { LinkDependencies, WishLinkResult } from "./link";
