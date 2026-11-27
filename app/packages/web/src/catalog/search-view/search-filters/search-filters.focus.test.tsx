// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import type { SpeciesHit } from "@pflanzendex/core";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AnnouncerProvider } from "@/shared/platform/announcer/announcer";
import { RouteFocus } from "@/shared/platform/routing/route-focus/route-focus";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { SpeciesSearch } from "../search-view";

// The focus of a changed filter (US-QS-15, issue 2628): the address of the list changes with every filter, which is a view
// change for RouteFocus, so it moved the focus to the heading. The controls that keep their own element (the quick filter
// chips and the controls of the layer "Filter") set the state `keepFocus`; the removable chips and the reset do not, because
// the button that was pressed is gone afterwards. These tests mount the real RouteFocus.

/** A hit with the fields the list reads; the id and the difficulty tell the hits apart. */
const hit = (id: string, difficulty: 1 | 2 | 3 | null) =>
  ({
    id,
    latinName: `Species ${id}`,
    germanName: null,
    difficulty,
    reviewStatus: "reviewed",
    own: false,
    hit: null,
    thumbnail: null,
  }) as unknown as SpeciesHit;

/** Four species: a and b are easy, c is medium, d is hard. */
const HITS = [hit("a", 1), hit("b", 1), hit("c", 2), hit("d", 3)];

/** The address the router shows and whether the last navigation asked to keep the focus (the state `keepFocus`). */
function Address() {
  const { pathname, search, state } = useLocation();
  const keep = (state as { keepFocus?: boolean } | null)?.keepFocus === true;
  return (
    <output data-testid="address" data-keep-focus={String(keep)}>
      {pathname + search}
    </output>
  );
}
const address = () => screen.getByTestId("address").textContent ?? "";
const keepsFocus = () => screen.getByTestId("address").getAttribute("data-keep-focus") === "true";

function page(at: string) {
  return render(
    <AnnouncerProvider>
      <MemoryRouter initialEntries={[at]}>
        <main id="inhalt" tabIndex={-1}>
          <RouteFocus titleOf={() => "Entdecken – PflanzenDéx"} />
          <SpeciesSearch
            searchText=""
            hit={HITS}
            onSearch={() => undefined}
            onOpen={() => undefined}
            onPropose={() => undefined}
            quickFilters={{ caught: new Set(["a"]) }}
          />
        </main>
        <Address />
      </MemoryRouter>
    </AnnouncerProvider>,
  );
}

const heading = () => screen.getByRole("heading", { level: 1, name: "Art wählen" });
const chip = (name: string) => screen.getByRole("button", { name });

/** The time RouteFocus needs to move a focus it would move: the mover is preloaded, so a tick of the page is enough. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 60));

class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(async () => {
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
  // RouteFocus loads its mover as a chunk of its own: load it once, so each test finds it at once.
  await import("@/shared/platform/routing/route-focus/focus-moves");
});
beforeEach(() => {
  setViewportWidth(360);
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.title = "";
});

describe("US-QS-15 · issue 2628 a quick filter chip keeps the focus on its own button", () => {
  it("US-QS-15 · issue 2628 pressing Leicht keeps the focus on the chip, and the address change asks to keep it", async () => {
    page("/discover?view=catalog");
    await userEvent.click(chip("Leicht"));
    await waitFor(() => expect(address()).toContain("difficulty=1"));
    await settle();
    expect(keepsFocus()).toBe(true);
    expect(chip("Leicht").getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement).toBe(chip("Leicht"));
    expect(document.activeElement).not.toBe(heading());
  });

  it("US-QS-15 · issue 2628 pressing Noch nicht gefangen keeps the focus on the chip, and the address change asks to keep it", async () => {
    page("/discover?view=catalog");
    await userEvent.click(chip("Noch nicht gefangen"));
    await waitFor(() => expect(address()).toContain("uncaught=1"));
    await settle();
    expect(keepsFocus()).toBe(true);
    expect(chip("Noch nicht gefangen").getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement).toBe(chip("Noch nicht gefangen"));
    expect(document.activeElement).not.toBe(heading());
  });

  it("US-QS-15 · issue 2628 keyboard: Tab to the chip, Space and Enter toggle it, and the focus stays on it", async () => {
    page("/discover?view=catalog");
    const easy = chip("Leicht");
    for (let tabs = 0; tabs < 8 && document.activeElement !== easy; tabs++) await userEvent.tab();
    expect(document.activeElement).toBe(easy);
    await userEvent.keyboard(" ");
    await waitFor(() => expect(address()).toContain("difficulty=1"));
    await settle();
    expect(document.activeElement).toBe(easy);
    expect(easy.getAttribute("aria-pressed")).toBe("true");
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(address()).not.toContain("difficulty"));
    await settle();
    expect(document.activeElement).toBe(easy);
    expect(easy.getAttribute("aria-pressed")).toBe("false");
  });

  it("US-QS-15 · issue 2628 two chips pressed one after the other: the focus is on the second one and the address holds both filters", async () => {
    page("/discover?view=catalog");
    await userEvent.click(chip("Leicht"));
    await userEvent.click(chip("Noch nicht gefangen"));
    await waitFor(() => expect(address()).toContain("uncaught=1"));
    await settle();
    expect(address()).toBe("/discover?view=catalog&difficulty=1&uncaught=1");
    expect(document.activeElement).toBe(chip("Noch nicht gefangen"));
  });
});

describe("US-QS-15 · issue 2628 the controls of the layer Filter keep the focus on their own element", () => {
  it("US-QS-15 · issue 2628 the select of the layer keeps the focus and the layer stays open", async () => {
    page("/discover?view=catalog&sheet=filters");
    const layer = await screen.findByRole("dialog", { name: "Filter" });
    const select = within(layer).getByRole("combobox", { name: "Schwierigkeit" });
    select.focus();
    await userEvent.selectOptions(select, "3");
    await waitFor(() => expect(address()).toContain("difficulty=3"));
    await settle();
    expect(keepsFocus()).toBe(true);
    expect(address()).toContain("sheet=filters");
    expect(document.activeElement).toBe(select);
  });

  it("US-QS-15 · issue 2628 both checkboxes of the layer keep the focus and the layer stays open", async () => {
    page("/discover?view=catalog&sheet=filters");
    const layer = await screen.findByRole("dialog", { name: "Filter" });
    for (const [name, part] of [
      ["Nur meine Vorschläge", "own=1"],
      ["Noch nicht gefangen", "uncaught=1"],
    ] as const) {
      const box = within(layer).getByRole("checkbox", { name });
      await userEvent.click(box);
      await waitFor(() => expect(address()).toContain(part));
      await settle();
      expect(keepsFocus()).toBe(true);
      expect(address()).toContain("sheet=filters");
      expect(document.activeElement).toBe(box);
    }
  });

  it("US-QS-15 · issue 2628 after a change in the layer, Fertig closes the layer and the choice stays in the address", async () => {
    page("/discover?view=catalog");
    await userEvent.click(screen.getByRole("button", { name: "Filter" }));
    const layer = await screen.findByRole("dialog", { name: "Filter" });
    await userEvent.selectOptions(
      within(layer).getByRole("combobox", { name: "Schwierigkeit" }),
      "3",
    );
    await userEvent.click(within(layer).getByRole("button", { name: "Fertig" }));
    await waitFor(() => expect(address()).not.toContain("sheet=filters"));
    expect(address()).toContain("difficulty=3");
    expect(screen.queryByRole("dialog", { name: "Filter" })).toBeNull();
  });
});

describe("US-QS-15 · issue 2628 a control that goes away with its filter still moves the focus to the heading", () => {
  it("US-QS-15 · issue 2628 removing a removable filter chip does not ask to keep the focus: the pressed button is gone, so the focus moves to the heading", async () => {
    page("/discover?view=catalog&difficulty=2");
    await userEvent.click(
      screen.getByRole("button", { name: "Filter entfernen: Schwierigkeit: Mittel" }),
    );
    await waitFor(() => expect(address()).not.toContain("difficulty"));
    expect(keepsFocus()).toBe(false);
    await waitFor(() => expect(document.activeElement).toBe(heading()));
  });

  it("US-QS-15 · issue 2628 the reset of filters that match nothing does not ask to keep the focus either", async () => {
    page("/discover?view=catalog&difficulty=1&uncaught=1&own=1");
    await userEvent.click(screen.getByRole("button", { name: "Filter zurücksetzen" }));
    await waitFor(() => expect(address()).toBe("/discover?view=catalog"));
    expect(keepsFocus()).toBe(false);
    await waitFor(() => expect(document.activeElement).toBe(heading()));
  });
});
