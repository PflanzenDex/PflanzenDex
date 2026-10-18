import type { MatchCard } from "@pflanzendex/core";
import { describe, expect, it } from "vitest";
import { cardTitle, deckReducer, initialDeck } from "./deck-state";

const c = (id: string, extra: Partial<MatchCard> = {}) =>
  ({ offerId: id, speciesGerman: null, speciesLatin: null, ...extra }) as MatchCard;

describe("US-TAU-02 deck state of the session", () => {
  it("US-TAU-02 Nein and Später move on and can be taken back; a Yes cannot", () => {
    let s = initialDeck([c("a"), c("b"), c("c")]);
    s = deckReducer(s, { type: "no", notice: "n" });
    s = deckReducer(s, { type: "later", card: c("b"), notice: "l" });
    expect([s.pos, s.declined, s.later.length, s.last]).toEqual([2, 1, 1, "later"]);
    s = deckReducer(s, { type: "undo" });
    expect([s.pos, s.declined, s.later.length, s.last]).toEqual([1, 1, 0, null]);
    s = deckReducer(s, { type: "yes", requested: true, notice: "y" });
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
    s = deckReducer(s, { type: "later", card: c("a"), notice: "l" });
    s = deckReducer(s, { type: "again" });
    expect([s.round.map((x) => x.offerId), s.pos, s.later.length]).toEqual([["a"], 0, 0]);
    expect(deckReducer(s, { type: "confirm", on: true }).confirming).toBe(true);
  });

  it("P-08 a card without any name is called unknown", () => {
    expect(cardTitle(c("a"))).toBe("Art unbekannt");
    expect(cardTitle(c("a", { speciesLatin: "Aloe vera" }))).toBe("Aloe vera");
  });
});
