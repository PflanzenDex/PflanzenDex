// @vitest-environment jsdom
import type { Suggestion, SuggestionDeck } from "@pflanzendex/core";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DeckView } from "./deck-view";

afterEach(cleanup);

const suggestion = (species: string): Suggestion => ({
  species,
  germanName: null,
  summary: "Ein Text.",
  summaryLanguage: "de",
  family: null,
  lightZone: null,
  difficulty: null,
  imageUrl: null,
  sourceUrl: null,
  attributes: { humidity: null, minTemperature: null, toxicToPets: null, growthSize: null },
  reasons: ["Diese Art hast du noch nicht gefangen."],
});
const deck: SuggestionDeck = {
  deck: 1,
  empty: null,
  suggestions: [suggestion("Ficus lyrata"), suggestion("Aloe vera")],
};

describe("US-QS-14 decision buttons stay with the card", () => {
  it("US-QS-14 keeps Nein, Später and Ja in a sticky row above the bar, at the bottom from md", () => {
    render(<DeckView deck={deck} onNewDeck={() => undefined} />);
    const row = screen.getByRole("button", { name: "Nein" }).parentElement?.parentElement;
    for (const name of ["Nein", "Später", "Ja"])
      expect(screen.getByRole("button", { name }).parentElement?.parentElement).toBe(row);
    expect(row?.className).toContain("sticky");
    expect(row?.className).toContain("bottom-[calc(3.5rem+env(safe-area-inset-bottom))]");
    expect(row?.className).toContain("md:bottom-0");
    expect(row?.className).toContain("bg-background");
  });

  it("US-QS-14 puts the row after the card and the honesty line, so no content sits behind it at the end", () => {
    render(<DeckView deck={deck} onNewDeck={() => undefined} />);
    const row = screen.getByRole("button", { name: "Nein" }).parentElement?.parentElement;
    const grid = row?.parentElement;
    expect(grid?.lastElementChild).toBe(row);
    expect(screen.getByRole("article").compareDocumentPosition(row as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("US-QS-14 lets the row scroll with the content in a window lower than 30 rem (400 % zoom)", () => {
    render(<DeckView deck={deck} onNewDeck={() => undefined} />);
    const row = screen.getByRole("button", { name: "Ja" }).parentElement?.parentElement;
    expect(row?.className).toContain("[@media(max-height:30rem)]:static");
  });
});
