// @vitest-environment jsdom
import type { Suggestion, SuggestionDeck } from "@pflanzendex/core";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShortcutOverview } from "@/shared/platform/device/keyboard/shortcut-overview/shortcut-overview";
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
const deckOf = (...species: string[]): SuggestionDeck => ({
  deck: 1,
  empty: null,
  zoneFilter: null,
  suggestions: species.map(suggestion),
});
const three = () => deckOf("Ficus lyrata", "Aloe vera", "Hoya carnosa");

function setup(deck = three()) {
  const onDecide = vi.fn(async (_s: string, decision: "yes" | "no") => ({
    ok: true as const,
    value: { decision, saved: true },
  }));
  const onUndo = vi.fn(async () => ({ ok: true as const, value: { undone: true } }));
  const view = render(
    <DeckView deck={deck} onDecide={onDecide} onUndo={onUndo} onNewDeck={() => undefined} />,
  );
  return { onDecide, onUndo, view };
}

const front = () => screen.getByRole("heading", { name: "Ficus lyrata" });
const key = (target: Element, k: string) => fireEvent.keyDown(target, { key: k });

describe("US-ENT-10 the stack names the position in text and hides the cards below", () => {
  it("US-ENT-10 shows Karte n von m and two cards below the top card, hidden from assistive technology", () => {
    const { view } = setup();
    expect(screen.getByText("Karte 1 von 3")).toBeTruthy();
    const below = view.container.querySelectorAll<HTMLElement>("[data-level]");
    expect(below).toHaveLength(2);
    for (const level of below) {
      expect(level.getAttribute("aria-hidden")).toBe("true");
      expect(level.hasAttribute("inert")).toBe(true);
    }
    expect(screen.getAllByRole("article")).toHaveLength(1);
  });

  it("US-ENT-10 the buttons No, Later, Yes stay as tap targets of at least 44 px", () => {
    setup();
    for (const name of ["Nein", "Später", "Ja"])
      expect(screen.getByRole("button", { name }).className).toContain("min-h-[48px]");
  });
});

describe("US-ENT-10 the arrow keys and Backspace decide while the deck has the focus", () => {
  it("US-ENT-10 right is Yes, written only through discover.decide, and the next card comes up", async () => {
    const { onDecide } = setup();
    key(front(), "ArrowRight");
    await screen.findByRole("heading", { name: "Aloe vera" });
    expect(onDecide).toHaveBeenCalledExactlyOnceWith("Ficus lyrata", "yes");
  });

  it("US-ENT-10 left is No on a button of the deck", async () => {
    const { onDecide } = setup();
    key(screen.getByRole("button", { name: "Ja" }), "ArrowLeft");
    await screen.findByRole("heading", { name: "Aloe vera" });
    expect(onDecide).toHaveBeenCalledExactlyOnceWith("Ficus lyrata", "no");
  });

  it("US-ENT-10 up and down are Later and write nothing", async () => {
    const { onDecide } = setup();
    key(front(), "ArrowUp");
    await screen.findByRole("heading", { name: "Aloe vera" });
    key(screen.getByRole("heading", { name: "Aloe vera" }), "ArrowDown");
    await screen.findByRole("heading", { name: "Hoya carnosa" });
    expect(onDecide).not.toHaveBeenCalled();
  });

  it("US-ENT-10 Backspace is Rückgängig where the button is offered, through discover.undo", async () => {
    const { onUndo } = setup();
    key(front(), "Backspace");
    expect(onUndo).not.toHaveBeenCalled();
    key(front(), "ArrowRight");
    await screen.findByRole("button", { name: "Rückgängig" });
    key(screen.getByRole("heading", { name: "Aloe vera" }), "Backspace");
    await screen.findByRole("heading", { name: "Ficus lyrata" });
    expect(onUndo).toHaveBeenCalledExactlyOnceWith("Ficus lyrata");
  });

  it("US-ENT-10 Backspace takes the last decision back at the end of the deck too", async () => {
    const { onUndo } = setup(deckOf("Ficus lyrata"));
    key(front(), "ArrowLeft");
    const newDeck = await screen.findByRole("button", { name: "Neuer Stapel" });
    key(newDeck, "Backspace");
    await waitFor(() => expect(onUndo).toHaveBeenCalledExactlyOnceWith("Ficus lyrata"));
  });

  it("US-ENT-10 the keys never act in a text field, with a modifier or outside the deck", async () => {
    const { onDecide } = setup();
    const field = document.createElement("input");
    front().closest("article")?.appendChild(field);
    key(field, "ArrowRight");
    fireEvent.keyDown(front(), { key: "ArrowRight", altKey: true });
    key(document.body, "ArrowRight");
    await act(() => new Promise((done) => setTimeout(done, 250)));
    expect(onDecide).not.toHaveBeenCalled();
    expect(front()).toBeTruthy();
  });
});

describe("US-ENT-10 the keys of the deck are listed in the shortcut overview of the view", () => {
  it("US-QS-11 the overview lists the deck keys in their own section while the deck is shown", async () => {
    const { view } = setup();
    render(<ShortcutOverview open onOpenChange={() => undefined} rows={[]} off={false} />);
    expect(await screen.findByRole("heading", { name: "In dieser Ansicht" })).toBeTruthy();
    for (const keys of ["Pfeil rechts", "Pfeil links", "Pfeil hoch oder runter", "Rücktaste"])
      expect(screen.getByText(keys)).toBeTruthy();
    view.unmount();
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "In dieser Ansicht" })).toBeNull(),
    );
  });
});
