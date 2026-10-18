import { describe, expect, it } from "vitest";
import { StubPhases } from "../offer/test-helpers";
import { InMemoryExchange, StubFacts, StubWishHints, friendOffer } from "../exchange/test-helpers";
import type { ExchangeDependencies, FriendOffer } from "../exchange";
import { execute } from "../../kernel/operation";
import { InMemoryIdempotencyStore } from "../../kernel/test-helpers";
import { matchDeck, matchYes } from "./index";
import { InMemoryMatchAnswers } from "./answer/test-helpers";

const id = (n: number) => `00000000-0000-4000-8000-0000000000${n.toString(16).padStart(2, "0")}`;
const sp = (latin: string | null) => ({
  name: "x",
  speciesLatin: latin,
  speciesGerman: latin ? "Deutsch" : null,
});

function setup(offers: FriendOffer[], wished = ["Aloe vera", "Echeveria elegans"]) {
  const facts = new StubFacts({
    [id(1)]: sp("Aloe vera"),
    [id(2)]: sp("Echeveria elegans"),
    [id(3)]: sp("Haworthia fasciata"),
    [id(4)]: sp(null),
  });
  const deps: ExchangeDependencies = {
    swaps: new InMemoryExchange({ anna: offers }),
    facts,
    treatments: {
      open: async () => new Map(),
      done: async () => [],
    } as unknown as ExchangeDependencies["treatments"],
    phases: new StubPhases({}),
    mine: { latinNamesOf: async () => [] },
    wishes: new StubWishHints({ anna: wished }),
  };
  return deps;
}
const deck = (deps: ExchangeDependencies, user = "anna") =>
  matchDeck(deps, new InMemoryMatchAnswers(), user, { timeZone: "Europe/Berlin" });
const offer = (n: number, extra: Partial<FriendOffer> = {}) =>
  friendOffer({ offerId: id(n + 100), specimenId: id(n), ...extra });

describe("US-TAU-01 match deck", () => {
  it("shows an open friend offer whose species is on my wishlist, with a visible reason (US-TAU-04)", async () => {
    const r = await deck(setup([offer(1)]));
    expect(r.ok && r.value.cards).toHaveLength(1);
    expect(r.ok && r.value.cards[0]).toMatchObject({
      speciesLatin: "Aloe vera",
      speciesGerman: "Deutsch",
      ownerName: "Ben",
      type: "cutting",
      mode: "swap",
      reasons: [{ kind: "wishlist", species: "Aloe vera" }],
    });
  });

  it("leaves out offers that match no wish and offers of an unknown species (P-08)", async () => {
    const r = await deck(setup([offer(1), offer(3), offer(4)]));
    expect(r.ok && r.value.cards.map((c) => c.speciesLatin)).toEqual(["Aloe vera"]);
  });

  it("shows nothing to a viewer for whom the database released nothing (P-05)", async () => {
    const r = await deck(setup([offer(1)]), "stranger");
    expect(r.ok && r.value.cards).toEqual([]);
  });

  it("orders by oldest offer, giver name, species, and is stable for the same data (FR-TAU-05)", async () => {
    const offers = [
      offer(2, { offeredAt: "2026-10-02T10:00:00.000Z", ownerName: "Ben" }),
      offer(1, { offeredAt: "2026-10-02T10:00:00.000Z", ownerName: "Ben" }),
      offer(2, { offerId: id(150), offeredAt: "2026-10-02T10:00:00.000Z", ownerName: "Anja" }),
      offer(1, { offerId: id(151), offeredAt: "2026-10-05T10:00:00.000Z", ownerName: "Anja" }),
    ];
    const first = await deck(setup(offers));
    const again = await deck(setup([...offers].reverse()));
    const view = (r: typeof first) =>
      r.ok ? r.value.cards.map((c) => `${c.ownerName}/${c.speciesLatin}`) : [];
    expect(view(first)).toEqual([
      "Anja/Echeveria elegans",
      "Ben/Aloe vera",
      "Ben/Echeveria elegans",
      "Anja/Aloe vera",
    ]);
    expect(view(again)).toEqual(view(first));
  });

  it("carries no score, percentage or rank (FR-TAU-06)", async () => {
    const r = await deck(setup([offer(1)]));
    expect(JSON.stringify(r)).not.toMatch(/score|percent|rank|stars/i);
  });

  it("refuses an invalid time zone", async () => {
    const r = await matchDeck(setup([offer(1)]), new InMemoryMatchAnswers(), "anna", {
      timeZone: "nope",
    });
    expect(!r.ok && r.error.code).toBe("input.invalid");
  });
});

describe("US-TAU-03 Yes on a card creates exactly one request", () => {
  const A = id(101);
  const run = (
    deps: ExchangeDependencies,
    input: unknown,
    user: string | null = "anna",
    key = "k1",
  ) =>
    execute(
      matchYes(deps, new InMemoryMatchAnswers()),
      { idempotency: new InMemoryIdempotencyStore() },
      { context: { userId: user }, input, idempotencyKey: key },
    );

  it("creates one request through the exchange store, with an open return", async () => {
    const deps = setup([offer(1)]);
    const r = await run(deps, { offerId: A });
    expect(r).toEqual({ ok: true, value: { outcome: "requested", swapId: "s-1" } });
    expect((deps.swaps as InMemoryExchange).requests).toEqual([
      { userId: "anna", offerId: A, counter: null, text: null },
    ]);
  });

  it("an offer that is already requested is reported, not an error and not a second request", async () => {
    const deps = setup([offer(1)]);
    (deps.swaps as InMemoryExchange).outcome = "already_requested";
    expect(await run(deps, { offerId: A })).toEqual({
      ok: true,
      value: { outcome: "already_requested", swapId: null },
    });
  });

  it.each([
    ["offer_unknown", "offer.not_found"],
    ["own_offer", "swap.own_offer"],
    ["not_open", "offer.not_active"],
  ] as const)("the outcome %s is the visible error %s (P-10)", async (outcome, code) => {
    const deps = setup([offer(1)]);
    (deps.swaps as InMemoryExchange).outcome = outcome;
    const r = await run(deps, { offerId: A });
    expect(!r.ok && r.error.code).toBe(code);
  });

  it("refuses a bad id and needs sign-in before asking the store", async () => {
    const deps = setup([offer(1)]);
    expect((await run(deps, { offerId: "x" })).ok).toBe(false);
    expect((await run(deps, { offerId: A }, null)).ok).toBe(false);
    expect((deps.swaps as InMemoryExchange).requests).toEqual([]);
  });

  it("the same Idempotency-Key replays the first answer without a second request", async () => {
    const deps = setup([offer(1)]);
    const idem = { idempotency: new InMemoryIdempotencyStore() };
    const call = () =>
      execute(matchYes(deps, new InMemoryMatchAnswers()), idem, {
        context: { userId: "anna" },
        input: { offerId: A },
        idempotencyKey: "k9",
      });
    await call();
    await call();
    expect((deps.swaps as InMemoryExchange).requests).toHaveLength(1);
  });
});
