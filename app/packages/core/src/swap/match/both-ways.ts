import type { ExchangeDependencies, ExchangeOffer } from "../exchange";

/**
 * "Fits both ways" (US-TAU-05): the giver has an open request on one of the keeper's own open offers. A fact, no rating:
 * it never changes the order of the deck (FR-TAU-06). It carries the keeper's own offer, so a Yes can propose it as the
 * counter-offer.
 */
export interface BothWaysReason {
  readonly kind: "both_ways";
  /** The giver's name as the keeper stored it; `null` = none. */
  readonly giverName: string | null;
  /** The keeper's own open offer the giver asked for. */
  readonly offerId: string;
  readonly specimenId: string;
  readonly speciesLatin: string | null;
  readonly speciesGerman: string | null;
}

/** One of the keeper's own open offers (US-TAU-05). */
export interface MyOffer {
  readonly offerId: string;
  readonly specimenId: string;
  readonly speciesLatin: string | null;
  readonly speciesGerman: string | null;
}

/** The keeper's own open offers; the adapter reads them as the keeper (P-04). */
export interface MyOffers {
  open(userId: string): Promise<readonly MyOffer[]>;
}

/** The keeper's open offers a friend has an open request on, per friend; empty without the own-offers port (US-TAU-05). */
export async function ownOffersAsked(
  deps: ExchangeDependencies,
  mine: MyOffers | undefined,
  userId: string,
): Promise<ReadonlyMap<string, readonly MyOffer[]>> {
  if (!mine) return new Map();
  const [open, sides] = await Promise.all([mine.open(userId), deps.swaps.list(userId)]);
  const byOffer = new Map(open.map((o) => [o.offerId, o]));
  const asked = new Map<string, MyOffer[]>();
  for (const side of sides) {
    const offer = byOffer.get(side.offerId);
    if (side.role !== "giver" || side.status !== "requested" || !side.otherId || !offer) continue;
    asked.set(side.otherId, [...(asked.get(side.otherId) ?? []), offer]);
  }
  return asked;
}

/**
 * "Fits both ways" for a card (US-TAU-05): one reason per own offer the giver asked for, oldest request first as stored.
 * Nothing is said about the giver's wishes: an unmarked wish stays private (FR-WUN-07, P-05). A pure fact, no order.
 */
export function bothWays(
  card: ExchangeOffer,
  asked: ReadonlyMap<string, readonly MyOffer[]>,
): readonly BothWaysReason[] {
  return (asked.get(card.ownerId) ?? []).map((o) => ({
    kind: "both_ways",
    giverName: card.ownerName,
    offerId: o.offerId,
    specimenId: o.specimenId,
    speciesLatin: o.speciesLatin,
    speciesGerman: o.speciesGerman,
  }));
}
