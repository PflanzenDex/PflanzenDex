import { describe, expect, it } from "vitest";
import { StubPhases } from "../offer/test-helpers";
import { InMemoryExchange, StubFacts, StubWishHints, friendOffer } from "../exchange/test-helpers";
import type { ExchangeDependencies, FriendOffer } from "../exchange";
import { matchDeck } from "./deck";

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
  matchDeck(deps, user, { timeZone: "Europe/Berlin" });
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
    const r = await matchDeck(setup([offer(1)]), "anna", { timeZone: "nope" });
    expect(!r.ok && r.error.code).toBe("input.invalid");
  });
});
