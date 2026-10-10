import { describe, expect, it } from "vitest";
import { execute } from "../../../kernel/operation";
import { InMemoryIdempotencyStore } from "../../../kernel/test-helpers";
import { exchangeList, swapRequest } from "../../index";
import { StubPhases } from "../../offer/test-helpers";
import { InMemoryExchange, StubFacts, StubWishHints, friendOffer } from "../test-helpers";
import type { ExchangeDependencies, FriendOffer } from "../types";

const A1 = "00000000-0000-4000-8000-0000000000a1";
const A2 = "00000000-0000-4000-8000-0000000000a2";
const B1 = "00000000-0000-4000-8000-0000000000b1";
const B2 = "00000000-0000-4000-8000-0000000000b2";
const MINE = "00000000-0000-4000-8000-0000000000c1";

const treatments = {
  open: async (_u: string, ids: readonly string[]) =>
    new Map(ids.filter((i) => i === B2).map((i) => [i, [{ reason: "Spinnmilben" }]] as const)),
  done: async (_u: string, id: string) =>
    id === B1
      ? [{ reason: "Schmierläuse", doneAt: "2026-09-20", agent: "Neemöl", note: "geheim" }]
      : [],
} as unknown as ExchangeDependencies["treatments"];

function setup(
  offers: FriendOffer[] = [
    friendOffer(),
    friendOffer({ offerId: A2, specimenId: B2, type: "plant", mode: "give_away" }),
  ],
) {
  const swaps = new InMemoryExchange({ anna: offers });
  const facts = new StubFacts({
    [B1]: { name: "Aloe Ableger", speciesLatin: "Aloe vera", speciesGerman: "Echte Aloe" },
    [B2]: { name: "Unbekannte", speciesLatin: null, speciesGerman: null },
  });
  const deps: ExchangeDependencies = {
    swaps,
    facts,
    treatments,
    phases: new StubPhases({ [B1]: "dormancy" }),
    mine: { latinNamesOf: async (u) => (u === "anna" ? ["Haworthia fasciata"] : []) },
    wishes: new StubWishHints({ anna: ["Aloe vera"] }),
  };
  return { deps, swaps, facts };
}
const list = (deps: ExchangeDependencies, query: Record<string, unknown> = {}, user = "anna") =>
  exchangeList(deps, user, { timeZone: "Europe/Berlin", ...query });

describe("US-SOZ-09 the exchange list", () => {
  it("shows species, type, mode, health details, phase, the chip 'you lack it' and the wishlist hint", async () => {
    const { deps } = setup();
    const r = await list(deps);
    expect(r.ok).toBe(true);
    const aloe = r.ok ? r.value.offers.find((o) => o.offerId === A1) : undefined;
    expect(aloe).toMatchObject({
      ownerName: "Ben",
      speciesLatin: "Aloe vera",
      speciesGerman: "Echte Aloe",
      specimenName: "Aloe Ableger",
      type: "cutting",
      mode: "swap",
      lack: true,
      onWishlist: true,
      phase: "dormancy",
      requested: false,
      health: {
        treatmentOpen: false,
        lastTreated: { reason: "Schmierläuse", doneAt: "2026-09-20" },
      },
    });
  });

  it("health never carries the agent or a note of the giver (P-05)", async () => {
    const { deps } = setup();
    const r = await list(deps);
    expect(JSON.stringify(r)).not.toContain("Neemöl");
    expect(JSON.stringify(r)).not.toContain("geheim");
  });

  it("a species without a known name is unknown, not 'lacking' and not on the wishlist (P-08); an open treatment shows", async () => {
    const { deps } = setup();
    const r = await list(deps);
    const unknown = r.ok ? r.value.offers.find((o) => o.offerId === A2) : undefined;
    expect(unknown).toMatchObject({
      lack: null,
      onWishlist: false,
      health: { treatmentOpen: true },
    });
  });

  it("a species I have caught is not marked as lacking", async () => {
    const { deps } = setup([friendOffer()]);
    const caught = { ...deps, mine: { latinNamesOf: async () => ["Aloe vera"] } };
    const r = await list(caught);
    expect(r.ok && r.value.offers[0]?.lack).toBe(false);
  });

  it("filters by type and by 'you lack it'", async () => {
    const { deps } = setup();
    const cutting = await list(deps, { type: "cutting" });
    expect(cutting.ok && cutting.value.offers.map((o) => o.offerId)).toEqual([A1]);
    const lack = await list(deps, { lack: "true" });
    expect(lack.ok && lack.value.offers.map((o) => o.offerId)).toEqual([A1]);
    const bad = await list(deps, { type: "tree" });
    expect(!bad.ok && bad.error.code).toBe("input.invalid");
    const badLack = await list(deps, { lack: "maybe" });
    expect(!badLack.ok && badLack.error.code).toBe("input.invalid");
  });

  it("an offer I have requested is marked and an invalid time zone is refused", async () => {
    const { deps, swaps } = setup([friendOffer()]);
    swaps.sides["anna"] = [
      {
        swapId: "s",
        role: "recipient",
        otherId: "ben",
        otherName: "Ben",
        offerId: A1,
        speciesLatin: "Aloe vera",
        speciesGerman: null,
        type: "cutting",
        mode: "swap",
        counterName: null,
        counterText: null,
        status: "requested",
        requestedAt: "2026-10-09T10:00:00.000Z",
        reason: null,
        cause: null,
        proposal: false,
        decidedAt: null,
      },
    ];
    const r = await list(deps);
    expect(r.ok && r.value.offers[0]?.requested).toBe(true);
    const bad = await exchangeList(deps, "anna", { timeZone: "Mars/Base" });
    expect(!bad.ok && bad.error.code).toBe("input.invalid");
  });

  it("the facts are read as the owner of the released offer only, and the viewer's own list is empty without friends", async () => {
    const { deps, facts } = setup();
    await list(deps);
    expect(new Set(facts.asked)).toEqual(new Set(["ben"]));
    const none = await list(deps, {}, "dora");
    expect(none.ok && none.value.offers).toEqual([]);
  });
});

describe("US-SOZ-09 requesting an offer", () => {
  const run = (
    deps: ExchangeDependencies,
    input: unknown,
    user: string | null = "anna",
    key = "k1",
  ) =>
    execute(
      swapRequest(deps),
      { idempotency: new InMemoryIdempotencyStore() },
      {
        context: { userId: user },
        input,
        idempotencyKey: key,
      },
    );

  it("requests an offer with a free-text return and answers the swap id", async () => {
    const { deps, swaps } = setup();
    const r = await run(deps, { offerId: A1, counterText: "  Ein Ableger bitte  " });
    expect(r.ok && r.value).toEqual({ swapId: "s-1" });
    expect(swaps.requests).toEqual([
      { userId: "anna", offerId: A1, counter: null, text: "Ein Ableger bitte" },
    ]);
  });

  it("attaches an own specimen as the counter-offer", async () => {
    const { deps, swaps } = setup();
    await run(deps, { offerId: A1, counterSpecimenId: MINE });
    expect(swaps.requests[0]).toMatchObject({ counter: MINE, text: null });
  });

  it.each([
    ["offer_unknown", "offer.not_found"],
    ["own_offer", "swap.own_offer"],
    ["not_open", "offer.not_active"],
    ["already_requested", "swap.already_requested"],
    ["counter_not_allowed", "swap.counter_not_allowed"],
    ["counter_unknown", "specimen.not_found"],
    ["counter_not_shared", "swap.counter_not_shared"],
  ] as const)("the outcome %s is the stable error %s", async (outcome, code) => {
    const { deps, swaps } = setup();
    swaps.outcome = outcome;
    const r = await run(deps, { offerId: A1 });
    expect(!r.ok && r.error.code).toBe(code);
  });

  it("refuses bad input before asking the store: id, specimen id, empty or too long text", async () => {
    const { deps, swaps } = setup();
    for (const input of [
      {},
      { offerId: "x" },
      { offerId: A1, counterSpecimenId: "x" },
      { offerId: A1, counterText: "" },
      { offerId: A1, counterText: "x".repeat(501) },
    ]) {
      const r = await run(deps, input);
      expect(!r.ok && r.error.code, JSON.stringify(input)).toBe("input.invalid");
    }
    expect(swaps.requests).toEqual([]);
  });

  it("needs sign-in, and the same Idempotency-Key replays the first answer without a second request", async () => {
    const { deps, swaps } = setup();
    const idem = { idempotency: new InMemoryIdempotencyStore() };
    const call = () =>
      execute(swapRequest(deps), idem, {
        context: { userId: "anna" },
        input: { offerId: A1 },
        idempotencyKey: "same",
      });
    await call();
    await call();
    expect(swaps.requests).toHaveLength(1);
    expect((await run(deps, { offerId: A1 }, null)).ok).toBe(false);
  });
});
