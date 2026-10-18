import { describe, expect, it } from "vitest";
import { execute } from "../../../kernel/operation";
import { InMemoryIdempotencyStore } from "../../../kernel/test-helpers";
import type { ExchangeDependencies, FriendOffer } from "../../exchange";
import {
  InMemoryExchange,
  StubFacts,
  StubWishHints,
  friendOffer,
} from "../../exchange/test-helpers";
import { StubPhases } from "../../offer/test-helpers";
import { matchAnswer, matchDeck, matchUndo, matchYes } from "../index";
import { InMemoryMatchAnswers } from "./test-helpers";

const id = (n: number) => `00000000-0000-4000-8000-0000000000${n.toString(16).padStart(2, "0")}`;
const A = id(101);
const B = id(102);
const TZ = "Europe/Berlin";
// 23:30 UTC on the 17th is already the 18th in Berlin: the date is the local one (NFR-08).
const clock = () => new Date("2026-10-17T23:30:00.000Z");

function setup() {
  const offers: FriendOffer[] = [
    friendOffer({ offerId: A, specimenId: id(1), offeredAt: "2026-10-01T10:00:00.000Z" }),
    friendOffer({ offerId: B, specimenId: id(2), offeredAt: "2026-10-02T10:00:00.000Z" }),
  ];
  const deps: ExchangeDependencies = {
    swaps: new InMemoryExchange({ anna: offers, cleo: offers }),
    facts: new StubFacts({
      [id(1)]: { name: "x", speciesLatin: "Aloe vera", speciesGerman: "Echte Aloe" },
      [id(2)]: { name: "y", speciesLatin: "Echeveria elegans", speciesGerman: null },
    }),
    treatments: {
      open: async () => new Map(),
      done: async () => [],
    } as unknown as ExchangeDependencies["treatments"],
    phases: new StubPhases({}),
    mine: { latinNamesOf: async () => [] },
    wishes: new StubWishHints({ anna: ["Aloe vera", "Echeveria elegans"], cleo: ["Aloe vera"] }),
  };
  return { deps, answers: new InMemoryMatchAnswers() };
}
const idem = () => ({ idempotency: new InMemoryIdempotencyStore() });
const answer = (
  s: ReturnType<typeof setup>,
  input: unknown,
  user: string | null = "anna",
  key = "k1",
) =>
  execute(matchAnswer(s.deps, s.answers, clock), idem(), {
    context: { userId: user },
    input,
    idempotencyKey: key,
  });
const deck = async (s: ReturnType<typeof setup>, user = "anna") => {
  const r = await matchDeck(s.deps, s.answers, user, { timeZone: TZ });
  if (!r.ok) throw new Error("deck");
  return { cards: r.value.cards.map((c) => c.offerId), later: r.value.later.map((c) => c.offerId) };
};

describe("US-TAU-02 No and Later are stored privately", () => {
  it("US-TAU-02 Later keeps the card findable in the Later list, with the local answer date", async () => {
    const s = setup();
    const r = await answer(s, { offerId: A, answer: "later", timeZone: TZ });
    expect(r).toEqual({ ok: true, value: { answeredOn: "2026-10-18" } });
    expect(await deck(s)).toEqual({ cards: [B], later: [A] });
    expect(s.answers.rows["anna"]?.get(A)).toMatchObject({ answer: "later", giverName: "Ben" });
  });

  it("US-TAU-02 No takes the card out of the deck, and it stays out after the next read", async () => {
    const s = setup();
    await answer(s, { offerId: A, answer: "no", timeZone: TZ });
    expect(await deck(s)).toEqual({ cards: [B], later: [] });
    expect(await deck(s)).toEqual({ cards: [B], later: [] });
  });

  it("US-TAU-02 undo takes No and Later back; the card is open again", async () => {
    const s = setup();
    await answer(s, { offerId: A, answer: "no", timeZone: TZ });
    await answer(s, { offerId: B, answer: "later", timeZone: TZ }, "anna", "k2");
    for (const o of [A, B]) {
      const r = await execute(matchUndo(s.answers), idem(), {
        context: { userId: "anna" },
        input: { offerId: o },
        idempotencyKey: `u${o}`,
      });
      expect(r.ok).toBe(true);
    }
    expect(await deck(s)).toEqual({ cards: [A, B], later: [] });
  });

  it("US-TAU-02 undo of an answer that does not exist is offer.not_found", async () => {
    const s = setup();
    const r = await execute(matchUndo(s.answers), idem(), {
      context: { userId: "anna" },
      input: { offerId: A },
      idempotencyKey: "u",
    });
    expect(!r.ok && r.error.code).toBe("offer.not_found");
  });

  it("US-TAU-02 a Yes after Later replaces the Later: the request is the only record (NFR-04)", async () => {
    const s = setup();
    await answer(s, { offerId: A, answer: "later", timeZone: TZ });
    const r = await execute(matchYes(s.deps, s.answers), idem(), {
      context: { userId: "anna" },
      input: { offerId: A },
      idempotencyKey: "y",
    });
    expect(r.ok).toBe(true);
    expect(s.answers.rows["anna"]?.has(A)).toBe(false);
  });

  it("US-TAU-02 FR-TAU-02 P-05 answers are private: another account's deck is untouched and cannot answer foreign cards", async () => {
    const s = setup();
    await answer(s, { offerId: A, answer: "no", timeZone: TZ });
    expect(await deck(s, "cleo")).toEqual({ cards: [A], later: [] });
    // Cleo's wishlist has no Echeveria: offer B is no card for her, so no answer can be stored for it.
    const r = await answer(s, { offerId: B, answer: "no", timeZone: TZ }, "cleo", "k3");
    expect(!r.ok && r.error.code).toBe("offer.not_found");
    expect(s.answers.rows["cleo"]?.size ?? 0).toBe(0);
  });

  it("US-TAU-02 refuses an unknown offer, a stranger, a bad answer, a bad zone and anonymous calls; nothing is stored", async () => {
    const s = setup();
    const bad = [
      { offerId: id(199), answer: "no", timeZone: TZ },
      { offerId: A, answer: "yes", timeZone: TZ },
      { offerId: A, answer: "no", timeZone: "nope" },
      { offerId: "x", answer: "no", timeZone: TZ },
    ];
    for (const input of bad) expect((await answer(s, input)).ok).toBe(false);
    expect((await answer(s, bad[0], "stranger")).ok).toBe(false);
    expect((await answer(s, { offerId: A, answer: "no", timeZone: TZ }, null)).ok).toBe(false);
    expect(Object.values(s.answers.rows).flatMap((m) => [...m.values()])).toEqual([]);
  });

  it("US-TAU-02 the same Idempotency-Key does not write twice", async () => {
    const s = setup();
    const store = idem();
    const call = () =>
      execute(matchAnswer(s.deps, s.answers, clock), store, {
        context: { userId: "anna" },
        input: { offerId: A, answer: "later", timeZone: TZ },
        idempotencyKey: "same",
      });
    await call();
    s.answers.rows["anna"]?.clear();
    await call();
    expect(s.answers.rows["anna"]?.size ?? 0).toBe(0);
  });
});
