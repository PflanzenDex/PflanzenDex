import type { MatchCard, MatchEntry } from "@pflanzendex/core";
import { describe, expect, it } from "vitest";
import { cardTitle, countOf, deckReducer, initialDeck, laterCards } from "./deck-state";

const c = (id: string, extra: Partial<MatchCard> = {}) =>
  ({
    offerId: id,
    speciesGerman: null,
    speciesLatin: null,
    ownerName: "Ben",
    ...extra,
  }) as MatchCard;
const entry = (card: MatchCard, answer: "no" | "later", state: MatchEntry["state"] = "open") =>
  ({
    offerId: card.offerId,
    answer,
    answeredOn: "2026-10-18",
    state,
    card: state === "open" ? card : null,
  }) as MatchEntry;
const no = (card: MatchCard) => ({
  type: "no" as const,
  card,
  answeredOn: "2026-10-18",
  notice: "n",
});
const later = (card: MatchCard) => ({
  type: "later" as const,
  card,
  answeredOn: "2026-10-18",
  notice: "l",
});

describe("US-TAU-02 deck state", () => {
  it("US-TAU-02 Nein and Später move on, create entries and can be taken back; a Yes cannot", () => {
    let s = initialDeck([c("a"), c("b"), c("c")]);
    s = deckReducer(s, no(c("a")));
    s = deckReducer(s, later(c("b")));
    expect([s.pos, countOf(s, "no"), countOf(s, "later"), s.last]).toEqual([2, 1, 1, "later"]);
    s = deckReducer(s, { type: "undo" });
    expect([s.pos, countOf(s, "no"), countOf(s, "later"), s.last]).toEqual([1, 1, 0, null]);
    s = deckReducer(s, { type: "yes", offerId: "b", requested: true, notice: "y" });
    expect([s.requested, s.last]).toEqual([1, null]);
    expect(deckReducer(s, { type: "undo" })).toBe(s);
  });

  it("US-TAU-03 a refusal keeps the card and shows the error; an unavailable offer moves on", () => {
    let s = initialDeck([c("a"), c("b")]);
    s = deckReducer(s, { type: "refused", error: "x" });
    expect([s.pos, s.error]).toEqual([0, "x"]);
    s = deckReducer(s, { type: "gone", notice: "weg" });
    expect([s.pos, s.error, s.notice]).toEqual([1, null, "weg"]);
  });

  it("US-TAU-02 the Später cards form the next round", () => {
    let s = initialDeck([c("a")]);
    s = deckReducer(s, later(c("a")));
    expect(laterCards(s).map((x) => x.offerId)).toEqual(["a"]);
    s = deckReducer(s, { type: "again" });
    expect([s.round.map((x) => x.offerId), s.pos, laterCards(s).length]).toEqual([["a"], 0, 1]);
    expect(deckReducer(s, { type: "confirm", on: true }).confirming).toBe(true);
  });

  it("P-08 a card without any name is called unknown", () => {
    expect(cardTitle(c("a"))).toBe("Art unbekannt");
    expect(cardTitle(c("a", { speciesLatin: "Aloe vera" }))).toBe("Aloe vera");
  });
});

describe("US-TAU-06 lists of answers in the deck state", () => {
  it("US-TAU-06 Reconsider turns a declined entry into a card at the end; Remove only drops the entry", () => {
    let s = initialDeck([c("b")], [entry(c("a"), "no"), entry(c("x"), "later", "unavailable")]);
    s = deckReducer(s, { type: "reconsider", offerId: "a" });
    expect([s.round.map((x) => x.offerId), s.entries.map((e) => e.offerId)]).toEqual([
      ["b", "a"],
      ["x"],
    ]);
    s = deckReducer(s, { type: "remove", offerId: "x" });
    expect(s.entries).toEqual([]);
    expect(s.round).toHaveLength(2);
  });

  it("US-TAU-06 an entry of an ended offer has no card, so it is never shown again or put in the deck", () => {
    const s = initialDeck(
      [],
      [entry(c("x"), "later", "unavailable"), entry(c("w"), "no", "wish_done")],
    );
    expect(laterCards(s)).toEqual([]);
    expect(deckReducer(s, { type: "reconsider", offerId: "x" }).round).toEqual([]);
  });

  it("US-TAU-06 the next round shows each Later card once, also when the deck brings it back by itself", () => {
    const s = initialDeck([c("a"), c("b")], [entry(c("a"), "later"), entry(c("z"), "later")]);
    const again = deckReducer(s, { type: "again" });
    expect(again.round.map((x) => x.offerId)).toEqual(["z", "a", "b"]);
  });
});
