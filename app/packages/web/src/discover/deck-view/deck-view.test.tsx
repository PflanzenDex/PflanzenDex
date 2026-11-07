// @vitest-environment jsdom
import type { Suggestion, SuggestionDeck } from "@pflanzendex/core";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  attributes: {
    humidity: null,
    minTemperature: null,
    toxicToPets: null,
    growthSize: null,
    lightDescription: null,
  },
  reasons: ["Diese Art hast du noch nicht gefangen."],
  exploration: false,
});
const saveOk = async () => ({
  ok: true as const,
  value: { decision: "yes" as const, saved: true },
});
const undoOk = async () => ({ ok: true as const, value: { undone: true } });
const deck: SuggestionDeck = {
  deck: 1,
  empty: null,
  zoneFilter: null,
  suggestions: [suggestion("Ficus lyrata"), suggestion("Aloe vera")],
};

describe("US-QS-21 the card takes the remaining height", () => {
  it("US-QS-21 the card fills the space, scrolls inside itself, the photo shrinks first and the buttons stay in view", () => {
    render(<DeckView deck={deck} onDecide={saveOk} onUndo={undoOk} onNewDeck={() => undefined} />);
    const card = screen.getByRole("article");
    expect(card.className).toContain("flex-1");
    expect(card.className).toContain("overflow-y-auto");
    const row = screen.getByRole("button", { name: "Nein" }).parentElement?.parentElement;
    expect(row?.className).toContain("shrink-0");
    expect(row?.parentElement?.lastElementChild).toBe(row);
  });
});

describe("US-QS-21 large text scrolls instead of clipping (WCAG 1.4.4, 1.4.10)", () => {
  const rowOf = () => screen.getByRole("button", { name: "Ja" }).parentElement;
  it("US-QS-21 wraps the buttons, keeps their 44 px size and gives the card and the stack a minimum height", () => {
    render(<DeckView deck={deck} onDecide={saveOk} onUndo={undoOk} onNewDeck={() => undefined} />);
    expect(rowOf()?.className).toContain("flex-wrap");
    for (const name of ["Nein", "Später", "Ja"]) {
      const button = screen.getByRole("button", { name });
      expect(button.className).toContain("min-w-24");
      expect(button.className).toContain("min-h-[48px]");
    }
    expect(screen.getByRole("article").className).toContain("min-h-48");
    // The stack of the card (the column with the position, the card and the buttons) keeps the minimum height.
    expect(screen.getByRole("article").closest(".min-h-\\[21rem\\]")).not.toBeNull();
  });

  it("US-QS-21 at 200 % text the row scrolls with the content and leaves room above the phone bar", () => {
    const size = vi
      .spyOn(window, "getComputedStyle")
      .mockReturnValue({ fontSize: "32px" } as CSSStyleDeclaration);
    render(<DeckView deck={deck} onDecide={saveOk} onUndo={undoOk} onNewDeck={() => undefined} />);
    size.mockRestore();
    const row = rowOf()?.parentElement;
    // The row is in the flow (no sticky class), and keeps the room of the phone bar while that bar is fixed (tall window).
    expect(row?.classList).not.toContain("tall-window:sticky");
    expect(row?.classList).toContain("tall-window:mb-20");
  });
});

describe("US-QS-14 decision buttons stay with the card", () => {
  it("US-QS-14 keeps Nein, Später and Ja in a sticky row above the bar, at the bottom from md", () => {
    render(<DeckView deck={deck} onDecide={saveOk} onUndo={undoOk} onNewDeck={() => undefined} />);
    const row = screen.getByRole("button", { name: "Nein" }).parentElement?.parentElement;
    for (const name of ["Nein", "Später", "Ja"])
      expect(screen.getByRole("button", { name }).parentElement?.parentElement).toBe(row);
    expect(row?.className).toContain("sticky");
    expect(row?.className).toContain("bottom-[calc(3.5rem+env(safe-area-inset-bottom))]");
    expect(row?.className).toContain("md:bottom-0");
    expect(row?.className).toContain("bg-background");
  });

  it("US-QS-14 puts the row after the card and the honesty line, so no content sits behind it at the end", () => {
    render(<DeckView deck={deck} onDecide={saveOk} onUndo={undoOk} onNewDeck={() => undefined} />);
    const row = screen.getByRole("button", { name: "Nein" }).parentElement?.parentElement;
    const grid = row?.parentElement;
    expect(grid?.lastElementChild).toBe(row);
    expect(screen.getByRole("article").compareDocumentPosition(row as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("US-QS-14 keeps the row in the flow in a window lower than 30 rem (400 % zoom) and sticky from 30 rem of height", () => {
    render(<DeckView deck={deck} onDecide={saveOk} onUndo={undoOk} onNewDeck={() => undefined} />);
    const row = screen.getByRole("button", { name: "Ja" }).parentElement?.parentElement;
    // Base style: no sticky class; the tall-window variant (from 30 rem of height) makes it sticky with the bar's offset.
    expect(row?.classList).toContain("tall-window:sticky");
    expect(row?.classList).not.toContain("sticky");
    expect(row?.className).toContain("tall-window:md:bottom-0");
  });
});

describe("US-ENT-07 deck for one zone", () => {
  const filtered = (shortfall: { text: string; nextAction: string } | null): SuggestionDeck => ({
    ...deck,
    zoneFilter: { zone: 3, name: "Lampe 3", available: 2, shortfall },
  });

  it("US-ENT-07 names the zone the deck is filtered to", () => {
    render(
      <DeckView
        deck={filtered(null)}
        onDecide={saveOk}
        onUndo={undoOk}
        onNewDeck={() => undefined}
      />,
    );
    expect(screen.getByText("Vorschläge für Lampe 3")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Art vorschlagen" })).toBeNull();
  });

  it("US-ENT-07 says the catalog does not suffice and offers the proposal of a species (P-09)", () => {
    const text = "Für Lampe 3 gibt es im Katalog nur 2 passende Arten (Puffer: 3).";
    render(
      <DeckView
        deck={filtered({ text, nextAction: "Du kannst eine Art vorschlagen." })}
        onDecide={saveOk}
        onUndo={undoOk}
        onNewDeck={() => undefined}
      />,
    );
    expect(screen.getByText(text)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Art vorschlagen" })).toBeTruthy();
  });

  it("US-QS-21 an empty zone with a shortfall shows the compact empty state, without the icon tile (issue 1343)", () => {
    const empty: SuggestionDeck = {
      ...filtered({ text: "Zu wenige Arten.", nextAction: "Schlag eine vor." }),
      suggestions: [],
      empty: { reason: "all_decided", text: "Keine neuen Vorschläge.", nextAction: "Weiter." },
    };
    render(<DeckView deck={empty} onDecide={saveOk} onUndo={undoOk} onNewDeck={() => undefined} />);
    expect(screen.getByRole("heading", { name: "Keine neuen Vorschläge." })).toBeTruthy();
    expect(screen.queryByText("🌱")).toBeNull();
  });

  it("US-ENT-07 an empty zone still shows the shortfall, not only the generic empty text (P-10)", () => {
    const text = "Für Lampe 3 gibt es im Katalog nur 0 passende Arten (Puffer: 2).";
    const empty: SuggestionDeck = {
      ...filtered({ text, nextAction: "Du kannst eine Art vorschlagen." }),
      suggestions: [],
      empty: { reason: "all_decided", text: "Keine neuen Vorschläge.", nextAction: "Weiter." },
    };
    render(<DeckView deck={empty} onDecide={saveOk} onUndo={undoOk} onNewDeck={() => undefined} />);
    expect(screen.getByText(text)).toBeTruthy();
  });
});

describe("US-ENT-01 the next card underneath, with ids of its own", () => {
  const two = () => ({
    ...deck,
    suggestions: [suggestion("Ficus lyrata"), suggestion("Aloe vera")],
  });

  it("US-ENT-01 shows the content of the next card under the front card, hidden from assistive technology and not focusable", () => {
    const { container } = render(
      <DeckView deck={two()} onDecide={saveOk} onUndo={undoOk} onNewDeck={() => undefined} />,
    );
    const under = container.querySelector<HTMLElement>(".inset-0[aria-hidden='true']");
    expect(under?.querySelector("h2")?.textContent).toBe("Aloe vera");
    expect(under?.hasAttribute("inert")).toBe(true);
    expect(screen.getByRole("heading", { name: "Ficus lyrata" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Aloe vera" })).toBeNull();
  });

  it("US-ENT-01 no element id occurs twice while the next card is shown, and each card names itself by its own heading", () => {
    const { container } = render(
      <DeckView deck={two()} onDecide={saveOk} onUndo={undoOk} onNewDeck={() => undefined} />,
    );
    const ids = Array.from(container.querySelectorAll("[id]"), (e) => e.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    const articles = container.querySelectorAll("article");
    expect(articles).toHaveLength(2);
    for (const article of articles) {
      const heading = document.getElementById(article.getAttribute("aria-labelledby") ?? "");
      expect(heading?.closest("article")).toBe(article);
    }
  });

  it("US-ENT-01 the last card has nothing underneath", () => {
    const { container } = render(
      <DeckView
        deck={{ ...deck, suggestions: [suggestion("Ficus lyrata")] }}
        onDecide={saveOk}
        onUndo={undoOk}
        onNewDeck={() => undefined}
      />,
    );
    expect(container.querySelector(".inset-0[aria-hidden='true']")).toBeNull();
  });
});

describe("US-ENT-04 Rückgängig is offered only after a Yes or No", () => {
  it("US-ENT-04 no undo button before a decision is written", () => {
    render(<DeckView deck={deck} onDecide={saveOk} onUndo={undoOk} onNewDeck={() => undefined} />);
    expect(screen.queryByRole("button", { name: "Rückgängig" })).toBeNull();
  });
});
