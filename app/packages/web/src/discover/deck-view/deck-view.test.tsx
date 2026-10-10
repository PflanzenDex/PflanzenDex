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
  exploration: false,
});
const saveOk = async () => ({
  ok: true as const,
  value: { decision: "yes" as const, saved: true },
});
const deck: SuggestionDeck = {
  deck: 1,
  empty: null,
  zoneFilter: null,
  suggestions: [suggestion("Ficus lyrata"), suggestion("Aloe vera")],
};

describe("US-QS-14 decision buttons stay with the card", () => {
  it("US-QS-14 keeps Nein, Später and Ja in a sticky row above the bar, at the bottom from md", () => {
    render(<DeckView deck={deck} onDecide={saveOk} onNewDeck={() => undefined} />);
    const row = screen.getByRole("button", { name: "Nein" }).parentElement?.parentElement;
    for (const name of ["Nein", "Später", "Ja"])
      expect(screen.getByRole("button", { name }).parentElement?.parentElement).toBe(row);
    expect(row?.className).toContain("sticky");
    expect(row?.className).toContain("bottom-[calc(3.5rem+env(safe-area-inset-bottom))]");
    expect(row?.className).toContain("md:bottom-0");
    expect(row?.className).toContain("bg-background");
  });

  it("US-QS-14 puts the row after the card and the honesty line, so no content sits behind it at the end", () => {
    render(<DeckView deck={deck} onDecide={saveOk} onNewDeck={() => undefined} />);
    const row = screen.getByRole("button", { name: "Nein" }).parentElement?.parentElement;
    const grid = row?.parentElement;
    expect(grid?.lastElementChild).toBe(row);
    expect(screen.getByRole("article").compareDocumentPosition(row as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("US-QS-14 lets the row scroll with the content in a window lower than 30 rem (400 % zoom)", () => {
    render(<DeckView deck={deck} onDecide={saveOk} onNewDeck={() => undefined} />);
    const row = screen.getByRole("button", { name: "Ja" }).parentElement?.parentElement;
    expect(row?.className).toContain("[@media(max-height:30rem)]:static");
  });
});

describe("US-ENT-07 deck for one zone", () => {
  const filtered = (shortfall: { text: string; nextAction: string } | null): SuggestionDeck => ({
    ...deck,
    zoneFilter: { zone: 3, name: "Lampe 3", available: 2, shortfall },
  });

  it("US-ENT-07 names the zone the deck is filtered to", () => {
    render(<DeckView deck={filtered(null)} onDecide={saveOk} onNewDeck={() => undefined} />);
    expect(screen.getByText("Vorschläge für Lampe 3")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Art vorschlagen" })).toBeNull();
  });

  it("US-ENT-07 says the catalog does not suffice and offers the proposal of a species (P-09)", () => {
    const text = "Für Lampe 3 gibt es im Katalog nur 2 passende Arten (Puffer: 3).";
    render(
      <DeckView
        deck={filtered({ text, nextAction: "Du kannst eine Art vorschlagen." })}
        onDecide={saveOk}
        onNewDeck={() => undefined}
      />,
    );
    expect(screen.getByText(text)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Art vorschlagen" })).toBeTruthy();
  });

  it("US-ENT-07 an empty zone still shows the shortfall, not only the generic empty text (P-10)", () => {
    const text = "Für Lampe 3 gibt es im Katalog nur 0 passende Arten (Puffer: 2).";
    const empty: SuggestionDeck = {
      ...filtered({ text, nextAction: "Du kannst eine Art vorschlagen." }),
      suggestions: [],
      empty: { reason: "all_decided", text: "Keine neuen Vorschläge.", nextAction: "Weiter." },
    };
    render(<DeckView deck={empty} onDecide={saveOk} onNewDeck={() => undefined} />);
    expect(screen.getByText(text)).toBeTruthy();
  });
});
