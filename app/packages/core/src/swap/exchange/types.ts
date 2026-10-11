import type { OfferDependencies, OfferHealth, OfferMode, OfferType } from "../offer";
import type { OwnSpeciesNames } from "../../social";

/** An open offer of a friend as the database releases it (US-SOZ-09): only what the exchange list needs. */
export interface FriendOffer {
  readonly ownerId: string;
  /** The name as the caller stored it for the friend; `null` = none (P-08). */
  readonly ownerName: string | null;
  readonly offerId: string;
  readonly specimenId: string;
  readonly type: OfferType;
  readonly mode: OfferMode;
  readonly wish: string | null;
  readonly note: string | null;
  /** UTC instant (ISO 8601). */
  readonly offeredAt: string;
  /** The giver shares the photos of this specimen (the photo itself follows with its own story). */
  readonly photosShared: boolean;
}

export type SwapStatus =
  "requested" | "accepted" | "handed_over" | "declined" | "canceled" | "withdrawn";

/** One side of a swap as its owner sees it (DM-SOZ-03). */
export interface SwapSide {
  readonly swapId: string;
  readonly role: "giver" | "recipient";
  readonly otherId: string;
  readonly otherName: string | null;
  readonly offerId: string;
  readonly speciesLatin: string | null;
  readonly speciesGerman: string | null;
  readonly type: OfferType;
  readonly mode: OfferMode;
  readonly counterName: string | null;
  readonly counterText: string | null;
  readonly status: SwapStatus;
  readonly requestedAt: string;
  /** The reason a person gave with a decline or cancelation. */
  readonly reason: string | null;
  /** Why the system ended the swap on its own; the screen turns the code into text. */
  readonly cause: SwapCause | null;
  /** The giver changed the counter-offer ("propose something else"). */
  readonly proposal: boolean;
  readonly decidedAt: string | null;
  /** Which sides confirmed the handover (US-SOZ-11); it counts only when both did. */
  readonly confirmedGiver: boolean;
  readonly confirmedRecipient: boolean;
  /** The specimen the giver gave (giver's row) and the one the recipient received (recipient's row). */
  readonly givenSpecimenId: string | null;
  readonly receivedSpecimenId: string | null;
  readonly handedOverAt: string | null;
}

export type SwapCause = "already_given" | "friendship_ended" | "offer_withdrawn";

/** Actions on a swap: the giver accepts, declines, proposes something else or cancels an accepted swap; the requester withdraws. */
export const SWAP_ACTIONS = ["accept", "decline", "propose", "cancel", "withdraw"] as const;
export type SwapAction = (typeof SWAP_ACTIONS)[number];

export type SwapAnswerOutcome =
  "ok" | "not_found" | "not_allowed" | "wrong_state" | "offer_not_open" | "friendship_ended";

export type RequestOutcome =
  | "requested"
  | "offer_unknown"
  | "own_offer"
  | "not_open"
  | "already_requested"
  | "counter_not_allowed"
  | "counter_unknown"
  | "counter_not_shared";

/** Port for persistence and for the release of friends' offers; the adapter lives in `db` (AB-1, P-04, P-05). */
export interface ExchangeStore {
  /** Open offers of confirmed friends, shared specimens only, newest first; the database decides (P-05). */
  friendOffers(userId: string): Promise<readonly FriendOffer[]>;
  /** Creates both sides of a swap in one step; nothing is written unless the outcome is `requested`. */
  request(
    userId: string,
    offerId: string,
    counterSpecimenId: string | null,
    counterText: string | null,
  ): Promise<{ readonly outcome: RequestOutcome; readonly swapId: string | null }>;
  /** The caller's own side of every swap, newest first. */
  list(userId: string): Promise<readonly SwapSide[]>;
  /** Answers or changes a swap; both sides change together, nothing is written on a refusal. */
  answer(
    userId: string,
    swapId: string,
    change: { action: SwapAction; reason: string | null; proposal: string | null },
  ): Promise<{ readonly outcome: SwapAnswerOutcome; readonly status: SwapStatus | null }>;
  /** From whom the caller received the given specimens (US-SOZ-13); specimens that were not received are missing. */
  provenanceFor(
    userId: string,
    specimenIds: readonly string[],
  ): Promise<ReadonlyMap<string, { readonly from: string | null; readonly date: string }>>;
  /** Cancels the open swaps of the caller whose friendship is gone; the number of canceled swaps. */
  cancelOrphaned(userId: string): Promise<number>;
}

/** What the wishlist can say about a species without handing its list over (FR-WUN-07): a yes or no per Latin name. */
export interface WishHints {
  /** The subset of `latinNames` that is on the caller's open wishlist. */
  onWishlist(userId: string, latinNames: readonly string[]): Promise<ReadonlySet<string>>;
}

/** Species and name of a shared specimen of a friend, read as the owner after the database released it. */
export interface OfferFacts {
  describe(
    ownerId: string,
    specimenIds: readonly string[],
  ): Promise<
    readonly {
      readonly id: string;
      readonly name: string;
      readonly speciesLatin: string | null;
      readonly speciesGerman: string | null;
    }[]
  >;
}

/** What the exchange needs from the neighbouring modules (ADR 0012); the app root wires it. */
export interface ExchangeDependencies {
  readonly swaps: ExchangeStore;
  readonly facts: OfferFacts;
  /** Treatments and phases of the friend's specimen: same ports as the offer, asked as the owner. */
  readonly treatments: OfferDependencies["treatments"];
  readonly phases: OfferDependencies["phases"];
  readonly mine: OwnSpeciesNames;
  readonly wishes: WishHints;
}

/** An offer of a friend with what is derived on every read (P-01). */
export interface ExchangeOffer extends FriendOffer {
  readonly specimenName: string | null;
  readonly speciesLatin: string | null;
  readonly speciesGerman: string | null;
  readonly health: OfferHealth;
  readonly phase: "growth" | "dormancy" | null;
  /** The chip "you lack it": the species is not among the caught ones; `null` = the species is unknown (P-08). */
  readonly lack: boolean | null;
  /** The species is on the caller's own wishlist; the list itself is never transmitted (FR-WUN-07). */
  readonly onWishlist: boolean;
  /** The caller has an open request for this offer already. */
  readonly requested: boolean;
}
