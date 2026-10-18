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

const OFFERS: FriendOffer[] = [
  friendOffer({ offerId: A, specimenId: id(1), offeredAt: "2026-10-01T10:00:00.000Z" }),
  friendOffer({ offerId: B, specimenId: id(2), offeredAt: "2026-10-02T10:00:00.000Z" }),
];

function setup(offers: FriendOffer[] = OFFERS, wished = ["Aloe vera", "Echeveria elegans"]) {
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
    wishes: new StubWishHints({ anna: wished, cleo: ["Aloe vera"] }),
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
const read = async (s: ReturnType<typeof setup>, user = "anna", at: () => Date = clock) => {
  const r = await matchDeck(s.deps, { answers: s.answers, clock: at }, user, { timeZone: TZ });
  if (!r.ok) throw new Error("deck");
  return r.value;
};
/** The open cards and the open Later cards, as the deck page shows them. */
const deck = async (s: ReturnType<typeof setup>, user = "anna") => {
  const r = await read(s, user);
  return {
    cards: r.cards.map((c) => c.offerId),
    later: r.entries.flatMap((e) => (e.answer === "later" && e.card ? [e.card.offerId] : [])),
  };
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

describe("US-TAU-06 find Later and No again", () => {
  const released = (s: ReturnType<typeof setup>) =>
    (s.deps.swaps as unknown as { released: Record<string, FriendOffer[]> }).released;
  const day = (iso: string) => () => new Date(iso);
  const entry = async (s: ReturnType<typeof setup>, offerId: string, at = clock) =>
    (await read(s, "anna", at)).entries.find((e) => e.offerId === offerId);

  it("US-TAU-06 a Later card stays in the list with its date and is back in the deck the next day, until decided", async () => {
    const s = setup();
    await answer(s, { offerId: A, answer: "later", timeZone: TZ });
    expect(await entry(s, A)).toMatchObject({
      answer: "later",
      answeredOn: "2026-10-18",
      state: "open",
    });
    const sameDay = await read(s);
    expect(sameDay.cards.map((c) => c.offerId)).toEqual([B]);
    const next = await read(s, "anna", day("2026-10-18T22:30:00.000Z")); // already the 19th in Berlin
    expect(next.cards.map((c) => c.offerId)).toEqual([A, B]);
    expect(next.entries.map((e) => e.offerId)).toEqual([A]);
    // Later again today hides it for another day.
    await execute(matchAnswer(s.deps, s.answers, day("2026-10-18T22:30:00.000Z")), idem(), {
      context: { userId: "anna" },
      input: { offerId: A, answer: "later", timeZone: TZ },
      idempotencyKey: "k5",
    });
    expect(
      (await read(s, "anna", day("2026-10-18T22:40:00.000Z"))).cards.map((c) => c.offerId),
    ).toEqual([B]);
  });

  it("US-TAU-06 a declined offer stays out of the deck, is listed with its date, and Reconsider puts it back", async () => {
    const s = setup();
    await answer(s, { offerId: A, answer: "no", timeZone: TZ });
    const later = day("2026-11-30T10:00:00.000Z");
    const r = await read(s, "anna", later);
    expect(r.cards.map((c) => c.offerId)).toEqual([B]);
    expect(r.entries).toMatchObject([
      { offerId: A, answer: "no", answeredOn: "2026-10-18", state: "open" },
    ]);
    const back = await execute(matchUndo(s.answers), idem(), {
      context: { userId: "anna" },
      input: { offerId: A },
      idempotencyKey: "r",
    });
    expect(back.ok).toBe(true);
    const after = await read(s, "anna", later);
    expect(after.cards.map((c) => c.offerId)).toEqual([A, B]);
    expect(after.entries).toEqual([]);
  });

  it("US-TAU-06 P-10 an offer that ended stays listed as unavailable with its names, and only the keeper removes it", async () => {
    const s = setup();
    await answer(s, { offerId: A, answer: "later", timeZone: TZ });
    released(s)["anna"] = OFFERS.filter((o) => o.offerId !== A);
    const e = await entry(s, A);
    expect(e).toMatchObject({
      state: "unavailable",
      card: null,
      speciesLatin: "Aloe vera",
      speciesGerman: "Echte Aloe",
      giverName: "Ben",
    });
    expect((await read(s)).cards.map((c) => c.offerId)).toEqual([B]);
    await execute(matchUndo(s.answers), idem(), {
      context: { userId: "anna" },
      input: { offerId: A },
      idempotencyKey: "rm",
    });
    expect(await entry(s, A)).toBeUndefined();
  });

  it("US-TAU-06 when the wish is done the entry says so and the offer leaves the deck (US-WUN-03)", async () => {
    const s = setup();
    await answer(s, { offerId: A, answer: "later", timeZone: TZ });
    const noWish = setup(OFFERS, ["Echeveria elegans"]);
    const e = await matchDeck(
      noWish.deps,
      { answers: s.answers, clock: day("2026-10-25T10:00:00.000Z") },
      "anna",
      { timeZone: TZ },
    );
    expect(e.ok && e.value.entries[0]).toMatchObject({
      offerId: A,
      state: "wish_done",
      card: null,
    });
    expect(e.ok && e.value.cards.map((c) => c.offerId)).toEqual([B]);
  });

  it("US-TAU-06 FR-TAU-02 the lists are private: another account has none of them", async () => {
    const s = setup();
    await answer(s, { offerId: A, answer: "no", timeZone: TZ });
    expect((await read(s, "cleo")).entries).toEqual([]);
  });

  it("US-TAU-06 FR-TAU-05 the same data and date give the same lists in the same order", async () => {
    const s = setup();
    await answer(s, { offerId: B, answer: "no", timeZone: TZ });
    await answer(s, { offerId: A, answer: "later", timeZone: TZ }, "anna", "k2");
    const one = await read(s);
    const two = await read(s);
    expect(two).toEqual(one);
    expect(JSON.stringify(one)).not.toMatch(/score|percent|rank|stars/i);
  });
});
