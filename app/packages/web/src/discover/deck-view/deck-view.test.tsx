// @vitest-environment jsdom
import type { Suggestion, SuggestionDeck } from "@pflanzendex/core";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GENERIC_ERROR_TEXT } from "@/shared/lib/error-text";
import { DeckView } from "./deck-view";
import { filledIn, hasOwnBorder, isPlain, isTinted } from "@/shared/ui/button.roles";

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
  it("US-QS-21 · US-QS-15 the card fills the space and never scrolls inside itself (the deck fits one screen, issue 2421); the buttons stay in view", () => {
    render(<DeckView deck={deck} onDecide={saveOk} onUndo={undoOk} onNewDeck={() => undefined} />);
    const card = screen.getByRole("article");
    expect(card.className).toContain("flex-1");
    expect(card.className).not.toMatch(/overflow-(y-)?(auto|scroll)/);
    const row = screen.getByRole("button", { name: "Kein Interesse" }).parentElement?.parentElement;
    expect(row?.className).toContain("shrink-0");
    expect(row?.parentElement?.lastElementChild).toBe(row);
  });
});

describe("US-QS-21 large text scrolls instead of clipping (WCAG 1.4.4, 1.4.10)", () => {
  const rowOf = () => screen.getByRole("button", { name: "Wünschen" }).parentElement;
  it("US-QS-21 wraps the buttons, keeps their 44 px size and gives the card and the stack a minimum height", () => {
    render(<DeckView deck={deck} onDecide={saveOk} onUndo={undoOk} onNewDeck={() => undefined} />);
    expect(rowOf()?.className).toContain("flex-wrap");
    for (const name of ["Kein Interesse", "Später", "Wünschen"]) {
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
  it("US-QS-14 keeps Kein Interesse, Später and Wünschen in a sticky row at the bottom of the deck frame", () => {
    render(<DeckView deck={deck} onDecide={saveOk} onUndo={undoOk} onNewDeck={() => undefined} />);
    const row = screen.getByRole("button", { name: "Kein Interesse" }).parentElement?.parentElement;
    for (const name of ["Kein Interesse", "Später", "Wünschen"])
      expect(screen.getByRole("button", { name }).parentElement?.parentElement).toBe(row);
    expect(row?.className).toContain("sticky");
    // The frame of the deck ends above the phone bar already, so the row sticks at its bottom edge (issue 2421).
    expect(row?.className).toContain("bottom-0");
    expect(row?.className).not.toContain("3.5rem");
    expect(row?.className).toContain("bg-background");
  });

  it("US-QS-14 puts the row after the card and the honesty line, so no content sits behind it at the end", () => {
    render(<DeckView deck={deck} onDecide={saveOk} onUndo={undoOk} onNewDeck={() => undefined} />);
    const row = screen.getByRole("button", { name: "Kein Interesse" }).parentElement?.parentElement;
    const grid = row?.parentElement;
    expect(grid?.lastElementChild).toBe(row);
    expect(screen.getByRole("article").compareDocumentPosition(row as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("US-QS-14 keeps the row in the flow in a window lower than 30 rem (400 % zoom) and sticky from 30 rem of height", () => {
    render(<DeckView deck={deck} onDecide={saveOk} onUndo={undoOk} onNewDeck={() => undefined} />);
    const row = screen.getByRole("button", { name: "Wünschen" }).parentElement?.parentElement;
    // Base style: no sticky class; the tall-window variant (from 30 rem of height) makes it sticky at the bottom of the frame.
    expect(row?.classList).toContain("tall-window:sticky");
    expect(row?.classList).not.toContain("sticky");
    expect(row?.className).toContain("tall-window:bottom-0");
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

describe("US-QS-30 the deck's network decisions wait offline (US-ENT-04)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("US-QS-30 offline Wünschen and Kein Interesse do not write and the card stays; Später still moves on", async () => {
    const state = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    const onDecide = vi.fn(saveOk);
    render(
      <DeckView deck={deck} onDecide={onDecide} onUndo={undoOk} onNewDeck={() => undefined} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Wünschen" }));
    expect(onDecide).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Wünschen" }).getAttribute("aria-disabled")).toBe(
      "true",
    );
    const later = screen.getByRole("button", { name: "Später" });
    expect(later.hasAttribute("aria-disabled")).toBe(false);
    await userEvent.click(later);
    expect(onDecide).not.toHaveBeenCalled();
    expect(screen.getByText("Aloe vera")).toBeTruthy();
    state.mockReturnValue(true);
    act(() => window.dispatchEvent(new Event("online")));
    expect(screen.getByRole("button", { name: "Wünschen" }).hasAttribute("aria-disabled")).toBe(
      false,
    );
  });
});

/** The text the request itself gives when it got no answer (`network.not_reachable`, issue 1884). */
const NO_ANSWER = "Der Server ist gerade nicht erreichbar. Bitte versuche es gleich noch einmal.";
const noAnswer = async () => ({
  ok: false as const,
  error: { code: "network.not_reachable", text: NO_ANSWER },
});

describe("US-QS-32 a decision without an answer shows the text of its request (issue 1884)", () => {
  it("US-QS-32 a Ja that gets no answer shows the request's own text, not the generic error, and the card stays", async () => {
    render(
      <DeckView deck={deck} onDecide={noAnswer} onUndo={undoOk} onNewDeck={() => undefined} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Wünschen" }));
    expect(await screen.findByText(NO_ANSWER)).toBeTruthy();
    expect(screen.queryByText(GENERIC_ERROR_TEXT)).toBeNull();
    expect(screen.getByText("Ficus lyrata")).toBeTruthy();
  });

  it("US-QS-32 a Rückgängig that gets no answer shows the request's own text too", async () => {
    render(
      <DeckView deck={deck} onDecide={saveOk} onUndo={noAnswer} onNewDeck={() => undefined} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Wünschen" }));
    await userEvent.click(await screen.findByRole("button", { name: "Rückgängig" }));
    expect(await screen.findByText(NO_ANSWER)).toBeTruthy();
    expect(screen.queryByText(GENERIC_ERROR_TEXT)).toBeNull();
  });
});

describe("US-QS-32 · SG-TYPE-04 at 200 % text the deck scrolls as a whole", () => {
  /** Renders the deck at a 200 % root text size (32 px), as the keeper's setting gives it (US-QS-21, WCAG 1.4.4). */
  function renderAt200(extra: Partial<SuggestionDeck> = {}) {
    const size = vi
      .spyOn(window, "getComputedStyle")
      .mockReturnValue({ fontSize: "32px" } as CSSStyleDeclaration);
    const view = render(
      <DeckView
        deck={{ ...deck, ...extra }}
        onDecide={saveOk}
        onUndo={undoOk}
        onNewDeck={() => undefined}
      />,
    );
    size.mockRestore();
    return view;
  }

  it("US-QS-32 · SG-TYPE-04 no element between the card and the deck holds a scroll region of its own", () => {
    const { container } = renderAt200();
    const card = screen.getByRole("article");
    expect(card.className).not.toMatch(/overflow-(y-)?(auto|scroll)/);
    for (let el = card.parentElement; el && el !== container; el = el.parentElement)
      expect(el.className).not.toMatch(/overflow-(y-)?(auto|scroll)/);
  });

  it("US-QS-32 · SG-TYPE-04 the card underneath takes its own height too at large text, as the front card does", () => {
    const { container } = renderAt200({
      suggestions: [suggestion("Ficus lyrata"), suggestion("Aloe vera")],
    });
    const under = container.querySelector<HTMLElement>('[data-level="1"] article');
    expect(under?.className).toContain("flex-none");
    expect(under?.className).not.toContain("overflow-y-auto");
    expect(under?.className).not.toContain("flex-1");
  });

  it("US-QS-32 · US-QS-15 · SG-TYPE-04 at the normal size the card underneath fills its frame like the front card, and does not scroll either", () => {
    const { container } = render(
      <DeckView
        deck={{ ...deck, suggestions: [suggestion("Ficus lyrata"), suggestion("Aloe vera")] }}
        onDecide={saveOk}
        onUndo={undoOk}
        onNewDeck={() => undefined}
      />,
    );
    const under = container.querySelector<HTMLElement>('[data-level="1"] article');
    expect(under?.className).toContain("flex-1");
    expect(under?.className).not.toMatch(/overflow-(y-)?(auto|scroll)/);
  });

  it("US-QS-32 · SG-TYPE-04 the decision buttons come after the card in the flow, not under it", () => {
    renderAt200();
    const card = screen.getByRole("article");
    for (const name of ["Kein Interesse", "Später", "Wünschen"]) {
      const button = screen.getByRole("button", { name });
      expect(card.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(card.contains(button)).toBe(false);
    }
  });
});

describe("US-QS-32 · SG-BTN-01 the deck: no outline button (FX-39 sweep 4)", () => {
  it("US-QS-32 · SG-BTN-01 'Kein Interesse' is plain, 'Später' tinted, and 'Wünschen' is the one filled button of the deck", () => {
    const { container } = render(
      <DeckView deck={deck} onDecide={saveOk} onUndo={undoOk} onNewDeck={() => undefined} />,
    );
    const no = screen.getByRole("button", { name: "Kein Interesse" });
    expect(isPlain(no)).toBe(true);
    expect(hasOwnBorder(no)).toBe(false);
    expect(isTinted(screen.getByRole("button", { name: "Später" }))).toBe(true);
    expect(filledIn(container)).toEqual([screen.getByRole("button", { name: "Wünschen" })]);
  });

  it("US-QS-32 · SG-BTN-01 'Rückgängig' is a plain button without a border", async () => {
    render(<DeckView deck={deck} onDecide={saveOk} onUndo={undoOk} onNewDeck={() => undefined} />);
    await userEvent.click(screen.getByRole("button", { name: "Wünschen" }));
    const undo = await screen.findByRole("button", { name: "Rückgängig" });
    expect(isPlain(undo)).toBe(true);
    expect(hasOwnBorder(undo)).toBe(false);
  });

  it("US-QS-32 · SG-BTN-01 'Art vorschlagen' in the notice about a short zone is a tinted link without a border", () => {
    const short: SuggestionDeck = {
      ...deck,
      zoneFilter: {
        zone: 3,
        name: "Lampe 3",
        available: 2,
        shortfall: { text: "Zu wenige Arten.", nextAction: "Du kannst eine Art vorschlagen." },
      },
    };
    render(<DeckView deck={short} onDecide={saveOk} onUndo={undoOk} onNewDeck={() => undefined} />);
    const propose = screen.getByRole("link", { name: "Art vorschlagen" });
    expect(isTinted(propose)).toBe(true);
    expect(hasOwnBorder(propose)).toBe(false);
  });
});
