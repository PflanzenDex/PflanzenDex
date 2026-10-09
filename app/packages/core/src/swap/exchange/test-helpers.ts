import type {
  ExchangeStore,
  FriendOffer,
  OfferFacts,
  RequestOutcome,
  SwapSide,
  WishHints,
} from "./types";

/** In-memory exchange for tests only; the real one lives in `db`. `released` is what the database would release per viewer. */
export class InMemoryExchange implements ExchangeStore {
  readonly requests: {
    userId: string;
    offerId: string;
    counter: string | null;
    text: string | null;
  }[] = [];
  readonly sides: Record<string, SwapSide[]> = {};
  outcome: RequestOutcome = "requested";

  constructor(private readonly released: Readonly<Record<string, readonly FriendOffer[]>>) {}

  async friendOffers(userId: string): Promise<readonly FriendOffer[]> {
    return this.released[userId] ?? [];
  }

  async request(userId: string, offerId: string, counter: string | null, text: string | null) {
    this.requests.push({ userId, offerId, counter, text });
    return { outcome: this.outcome, swapId: this.outcome === "requested" ? "s-1" : null };
  }

  async list(userId: string): Promise<readonly SwapSide[]> {
    return this.sides[userId] ?? [];
  }
}

export const friendOffer = (extra: Partial<FriendOffer> = {}): FriendOffer => ({
  ownerId: "ben",
  ownerName: "Ben",
  offerId: "00000000-0000-4000-8000-0000000000a1",
  specimenId: "00000000-0000-4000-8000-0000000000b1",
  type: "cutting",
  mode: "swap",
  wish: null,
  note: null,
  offeredAt: "2026-10-08T10:00:00.000Z",
  photosShared: false,
  ...extra,
});

export class StubFacts implements OfferFacts {
  readonly asked: string[] = [];
  constructor(
    private readonly rows: Readonly<
      Record<string, { name: string; speciesLatin: string | null; speciesGerman: string | null }>
    >,
  ) {}
  async describe(ownerId: string, ids: readonly string[]) {
    this.asked.push(ownerId);
    return ids.flatMap((id) => (this.rows[id] ? [{ id, ...this.rows[id] }] : []));
  }
}

export class StubWishHints implements WishHints {
  constructor(private readonly names: Readonly<Record<string, readonly string[]>> = {}) {}
  async onWishlist(userId: string, latinNames: readonly string[]) {
    const own = new Set(this.names[userId] ?? []);
    return new Set(latinNames.filter((n) => own.has(n)));
  }
}
