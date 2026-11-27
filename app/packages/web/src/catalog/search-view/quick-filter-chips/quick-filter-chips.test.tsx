// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import type { SpeciesHit } from "@pflanzendex/core";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { isFilled, isTinted } from "@/shared/ui/button.roles";
import { SpeciesSearch } from "../search-view";

/** A hit with the fields the list reads; the id and the difficulty tell the hits apart. */
const hit = (id: string, difficulty: 1 | 2 | 3 | null, extra: Partial<SpeciesHit> = {}) =>
  ({
    id,
    latinName: `Species ${id}`,
    germanName: null,
    difficulty,
    reviewStatus: "reviewed",
    own: false,
    hit: null,
    thumbnail: null,
    ...extra,
  }) as unknown as SpeciesHit;

/** Four species: a and b are easy, c is medium, d is hard. */
const HITS = [hit("a", 1), hit("b", 1), hit("c", 2), hit("d", 3)];

function Address() {
  const l = useLocation();
  return <output data-testid="address">{l.pathname + l.search}</output>;
}
const address = () => screen.getByTestId("address").textContent ?? "";

const onSearch = vi.fn();
const onOpen = vi.fn();
const onPropose = vi.fn();

type Quick = { caught: ReadonlySet<string> | null; loading?: boolean } | undefined;

const tree = (hits: readonly SpeciesHit[], quick: Quick, at: string) => (
  <MemoryRouter initialEntries={[at]}>
    <SpeciesSearch
      searchText=""
      hit={hits}
      onSearch={onSearch}
      onOpen={onOpen}
      onPropose={onPropose}
      embedded
      {...(quick ? { quickFilters: quick } : {})}
    />
    <Address />
  </MemoryRouter>
);

function search(quick: Quick, at = "/discover?view=catalog", hits: readonly SpeciesHit[] = HITS) {
  return render(tree(hits, quick, at));
}

const chip = (name: string) => screen.getByRole("button", { name });
const pressed = (name: string) => chip(name).getAttribute("aria-pressed");
const shown = () =>
  within(screen.getByRole("list", { name: "Treffer" }))
    .getAllByRole("button")
    .map((b) => /Species (\w)/.exec(b.textContent ?? "")?.[1]);

/** The layout of the test: the width of the chip row and of the chips in their widest form (px). */
let layout: { row: number; chips?: number[] } = { row: 0 };
const observers: ResizeObserverCallback[] = [];
class FakeResizeObserver {
  private readonly callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    observers.push(callback);
  }
  observe() {}
  unobserve() {}
  disconnect() {
    observers.splice(observers.indexOf(this.callback), 1);
  }
}

beforeAll(() => {
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
});
beforeEach(() => {
  setViewportWidth(360);
  layout = { row: 0 };
  observers.length = 0;
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    let width = 0;
    if (this.hasAttribute("data-quick-row")) width = layout.row;
    else if (this.parentElement?.hasAttribute("data-quick-measure")) {
      const index = Array.from(this.parentElement.children).indexOf(this);
      width = layout.chips?.[index] ?? 0;
    }
    return { width, height: 0, top: 0, left: 0, right: width, bottom: 0, x: 0, y: 0, toJSON() {} };
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("US-QS-15 · US-QS-21 the quick filters Leicht and Noch nicht gefangen on Entdecken (issue 2587, owner decision d-166)", () => {
  it("US-QS-15 · US-QS-21 two toggle chips stand in one chip row, the marked sideways region of the one-screen gate, directly under the search field row", () => {
    search({ caught: new Set() });
    const group = screen.getByRole("group", { name: "Schnellfilter" });
    expect(group.getAttribute("data-scroll-x")).toBe("chips");
    expect([...group.querySelectorAll("button")].map((b) => b.textContent)).toEqual([
      "Leicht",
      "Noch nicht gefangen",
    ]);
    expect(document.querySelectorAll('[data-scroll-x="chips"]')).toHaveLength(1);
    // The row of the search field and the "Filter" opener comes first, the chip row follows it at once.
    const searchRow = screen.getByRole("search").parentElement;
    expect(searchRow?.contains(screen.getByRole("button", { name: "Filter" }))).toBe(true);
    expect(searchRow?.nextElementSibling?.contains(group)).toBe(true);
  });

  it("US-QS-15 · US-QS-21 without quick filters (the collection's hand-over) the page has no chips and no layer checkbox", async () => {
    search(undefined, "/discover?view=catalog&sheet=filters");
    expect(screen.queryByRole("group", { name: "Schnellfilter" })).toBeNull();
    expect(document.querySelector('[data-scroll-x="chips"]')).toBeNull();
    expect(screen.queryByRole("button", { name: "Noch nicht gefangen" })).toBeNull();
    const layer = await screen.findByRole("dialog", { name: "Filter" });
    expect(within(layer).queryByRole("checkbox", { name: "Noch nicht gefangen" })).toBeNull();
    expect(within(layer).getByRole("combobox", { name: "Schwierigkeit" })).toBeTruthy();
  });

  it("US-QS-15 each chip is a toggle button of 44 px that never shrinks and never breaks its text", () => {
    search({ caught: new Set() });
    for (const name of ["Leicht", "Noch nicht gefangen"]) {
      const button = chip(name);
      expect(button.getAttribute("aria-pressed")).toBe("false");
      expect(button.className).toContain("min-h-[44px]");
      expect(button.className).toContain("shrink-0");
      expect(button.className).toContain("whitespace-nowrap");
    }
  });

  it("US-QS-15 a pressed chip shows more than colour: a check mark and a thicker border, besides aria-pressed", async () => {
    search({ caught: new Set() });
    expect(chip("Leicht").querySelector("svg")).toBeNull();
    expect(chip("Leicht").className).not.toContain("border-2");
    await userEvent.click(chip("Leicht"));
    expect(pressed("Leicht")).toBe("true");
    expect(chip("Leicht").querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(chip("Leicht").className).toContain("border-2");
  });

  it("US-QS-15 SG-TYPE-01 the pressed chip keeps the weight 600 of every control label; 700 is for the page title only (issue 2612)", async () => {
    search({ caught: new Set() });
    await userEvent.click(chip("Leicht"));
    const classes = chip("Leicht").className.split(/\s+/);
    expect(classes).toContain("font-semibold");
    for (const heavy of ["font-bold", "font-extrabold", "font-black"]) {
      expect(classes).not.toContain(heavy);
    }
    // The measuring row draws the same pressed form, so its width is the width of the pressed chip.
    for (const measured of document.querySelectorAll("[data-quick-measure] button")) {
      expect(measured.className.split(/\s+/)).not.toContain("font-bold");
    }
  });

  it("US-QS-15 d-178 a pressed chip is an outlined chip, not a tinted button: card fill, a 2 px primary border, primary label and check, a neutral hover (SG-BTN-02, SG-COLOR-01)", async () => {
    search({ caught: new Set() });
    await userEvent.click(chip("Leicht"));
    const pressedChip = chip("Leicht");
    const classes = pressedChip.className.split(/\s+/);
    expect(isTinted(pressedChip)).toBe(false);
    expect(isFilled(pressedChip)).toBe(false);
    for (const wanted of ["bg-card", "border-2", "border-primary", "text-primary"]) {
      expect(classes).toContain(wanted);
    }
    // The hover is the neutral ghost hover of every chip, as for the unpressed chip; no variant colours it green at rest.
    expect(classes).toContain("hover:bg-accent");
    expect(chip("Noch nicht gefangen").className.split(/\s+/)).toContain("hover:bg-accent");
    // The state is not told by colour alone (SG-COLOR-05): the check mark, the border and aria-pressed.
    expect(pressedChip.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(pressedChip.getAttribute("aria-pressed")).toBe("true");
  });

  it("US-QS-15 d-171 an unpressed chip is outlined on the neutral surface: the card fill of the search field and the --input border, in light and dark (issue 2612)", () => {
    search({ caught: new Set() });
    const field = screen.getByRole("searchbox").className.split(/\s+/);
    expect(field).toContain("bg-card");
    for (const name of ["Leicht", "Noch nicht gefangen"]) {
      const classes = chip(name).className.split(/\s+/);
      // The same token as the field, so the two cannot differ in dark (page 11,11,12 against card 22,22,24).
      expect(classes).toContain("bg-card");
      expect(classes).not.toContain("bg-background");
      expect(classes).toContain("border-input");
    }
  });
});

describe("US-QS-15 · US-QS-21 the chip Leicht is the filter difficulty 1", () => {
  it("US-QS-15 · US-QS-21 pressing Leicht keeps the easy species, writes the address and sets aria-pressed; pressing it again takes the filter off", async () => {
    search({ caught: new Set() });
    expect(shown()).toEqual(["a", "b", "c", "d"]);
    await userEvent.click(chip("Leicht"));
    expect(address()).toBe("/discover?view=catalog&difficulty=1");
    expect(pressed("Leicht")).toBe("true");
    expect(shown()).toEqual(["a", "b"]);
    await userEvent.click(chip("Leicht"));
    expect(address()).toBe("/discover?view=catalog");
    expect(pressed("Leicht")).toBe("false");
    expect(shown()).toEqual(["a", "b", "c", "d"]);
  });

  it("US-QS-15 · US-QS-21 a link with difficulty=1 opens with Leicht pressed", () => {
    search({ caught: new Set() }, "/discover?view=catalog&difficulty=1");
    expect(pressed("Leicht")).toBe("true");
  });

  it("US-QS-15 · US-QS-21 with the layer's difficulty Mittel or Schwierig chosen Leicht is not pressed, and pressing it replaces the choice", async () => {
    search({ caught: new Set() }, "/discover?view=catalog&difficulty=2");
    expect(pressed("Leicht")).toBe("false");
    expect(shown()).toEqual(["c"]);
    await userEvent.click(chip("Leicht"));
    expect(address()).toBe("/discover?view=catalog&difficulty=1");
    expect(shown()).toEqual(["a", "b"]);
  });

  it("US-QS-15 · US-QS-21 a changed quick filter starts the list at the first entry", async () => {
    search({ caught: new Set() }, "/discover?view=catalog&from=6");
    await userEvent.click(chip("Leicht"));
    await vi.waitFor(() => expect(address()).not.toContain("from="));
  });
});

describe("US-QS-15 · US-QS-21 the chip Noch nicht gefangen hides the caught species", () => {
  it("US-QS-15 · US-QS-21 pressing it hides the species of the caught set, writes ?uncaught=1 and sets aria-pressed; pressing it again shows them", async () => {
    search({ caught: new Set(["a", "c"]) });
    await userEvent.click(chip("Noch nicht gefangen"));
    expect(address()).toBe("/discover?view=catalog&uncaught=1");
    expect(pressed("Noch nicht gefangen")).toBe("true");
    expect(shown()).toEqual(["b", "d"]);
    await userEvent.click(chip("Noch nicht gefangen"));
    expect(address()).toBe("/discover?view=catalog");
    expect(pressed("Noch nicht gefangen")).toBe("false");
    expect(shown()).toEqual(["a", "b", "c", "d"]);
  });

  it("US-QS-15 · US-QS-21 both chips together keep the easy species that are not caught yet", async () => {
    search({ caught: new Set(["a"]) });
    await userEvent.click(chip("Leicht"));
    await userEvent.click(chip("Noch nicht gefangen"));
    expect(address()).toBe("/discover?view=catalog&difficulty=1&uncaught=1");
    expect(shown()).toEqual(["b"]);
  });

  it("US-QS-15 · US-QS-21 while the caught species are not known the chip is disabled and says why, and Leicht still works (P-08, P-10)", async () => {
    search({ caught: null });
    const uncaught = chip("Noch nicht gefangen");
    expect((uncaught as HTMLButtonElement).disabled).toBe(true);
    expect(uncaught.getAttribute("aria-describedby")).toBeTruthy();
    const why = document.getElementById(uncaught.getAttribute("aria-describedby") ?? "");
    expect(why?.textContent).toBe("Gefangene Arten sind unbekannt.");
    expect((chip("Leicht") as HTMLButtonElement).disabled).toBe(false);
    await userEvent.click(chip("Leicht"));
    expect(shown()).toEqual(["a", "b"]);
  });

  it("US-QS-15 · US-QS-21 an address with uncaught=1 does not filter while the caught species are not known, and takes effect as soon as they are", () => {
    const { rerender } = search({ caught: null }, "/discover?view=catalog&uncaught=1");
    expect(shown()).toEqual(["a", "b", "c", "d"]);
    expect(pressed("Noch nicht gefangen")).toBe("false");
    expect(screen.getByRole("button", { name: "Filter" })).toBeTruthy();
    rerender(tree(HITS, { caught: new Set(["a", "b", "c"]) }, "/discover?view=catalog&uncaught=1"));
    expect(shown()).toEqual(["d"]);
    expect(pressed("Noch nicht gefangen")).toBe("true");
    expect(screen.getByRole("button", { name: "Filter (1)" })).toBeTruthy();
  });

  it("US-QS-15 · US-QS-21 another filter changed while the caught species are not known keeps the choice uncaught=1 in the address", async () => {
    search({ caught: null }, "/discover?view=catalog&uncaught=1");
    await userEvent.click(chip("Leicht"));
    expect(address()).toBe("/discover?view=catalog&uncaught=1&difficulty=1");
  });

  it("US-QS-15 · US-QS-21 without quick filters an address with uncaught=1 filters nothing (the collection has no caught set)", () => {
    search(undefined, "/discover?view=catalog&uncaught=1");
    expect(shown()).toEqual(["a", "b", "c", "d"]);
    expect(screen.queryByRole("button", { name: /^Filter \(/ })).toBeNull();
  });
});

describe("US-QS-15 the reason of the disabled chip Noch nicht gefangen is a visible line under the row (issue 2610, SG-BTN-05, P-09, P-10)", () => {
  const REASON = "Gefangene Arten sind unbekannt.";
  const whyOf = () => {
    const id = chip("Noch nicht gefangen").getAttribute("aria-describedby") ?? "";
    return document.getElementById(id);
  };

  it("US-QS-15 while the caught species are not known the reason is a paragraph that everyone sees, not a screen-reader-only span, and the disabled chip points to it with aria-describedby", () => {
    search({ caught: null });
    const why = whyOf();
    expect(why?.tagName).toBe("P");
    expect(why?.textContent).toBe(REASON);
    for (const hidden of ["sr-only", "invisible", "hidden", "opacity-0"]) {
      expect(why?.className.split(/\s+/)).not.toContain(hidden);
    }
    expect(why?.closest("[aria-hidden]")).toBeNull();
    expect(why?.closest("[inert]")).toBeNull();
    // The text of the reason is on the page once: the measuring row repeats no text.
    expect(screen.getAllByText(REASON)).toHaveLength(1);
  });

  it("US-QS-15 the reason stands directly under the chip row, outside the row, in the quiet text of a hint (14 px, muted), and it may wrap", () => {
    search({ caught: null });
    const group = screen.getByRole("group", { name: "Schnellfilter" });
    const why = whyOf();
    expect(why).not.toBeNull();
    expect(group.contains(why)).toBe(false);
    expect(group.nextElementSibling).toBe(why);
    expect(why?.parentElement).toBe(group.parentElement);
    const classes = why?.className.split(/\s+/) ?? [];
    expect(classes).toContain("text-sm");
    expect(classes).toContain("text-muted-foreground");
    for (const clipped of ["truncate", "whitespace-nowrap", "line-clamp-1", "overflow-hidden"]) {
      expect(classes).not.toContain(clipped);
    }
  });

  it("US-QS-15 the reason stays in view when the chips scroll sideways, because it is not part of the scrolling row", () => {
    layout = { row: 300, chips: [90, 330] };
    search({ caught: null });
    const group = screen.getByRole("group", { name: "Schnellfilter" });
    expect(group.className).toContain("overflow-x-auto");
    expect(group.textContent).toBe("LeichtNoch nicht gefangen");
    expect(whyOf()?.textContent).toBe(REASON);
  });

  it("US-QS-15 the line does not touch the measuring row: it holds the chips only and the choice between wrapping and scrolling stays the same", () => {
    layout = { row: 340, chips: [90, 170] };
    search({ caught: null });
    const measure = document.querySelector("[data-quick-measure]");
    expect(measure?.querySelectorAll("p")).toHaveLength(0);
    expect(measure?.children).toHaveLength(2);
    expect(screen.getByRole("group", { name: "Schnellfilter" }).className).not.toContain(
      "overflow-x-auto",
    );
  });

  it("US-QS-15 once the caught species are known the line is gone, the chip is enabled and no space is kept", () => {
    const { rerender } = search({ caught: null });
    expect(screen.queryByText(REASON)).not.toBeNull();
    rerender(tree(HITS, { caught: new Set(["a"]) }, "/discover?view=catalog"));
    expect(screen.queryByText(REASON)).toBeNull();
    const uncaught = chip("Noch nicht gefangen") as HTMLButtonElement;
    expect(uncaught.disabled).toBe(false);
    expect(uncaught.hasAttribute("aria-describedby")).toBe(false);
    const row = document.querySelector("[data-quick-row]");
    expect(
      [...(row?.children ?? [])].map((child) => child.getAttribute("role") ?? "measure"),
    ).toEqual(["group", "measure"]);
    expect(row?.querySelector("p")).toBeNull();
  });

  it("US-QS-15 when the caught species are known from the start there is no line at all", () => {
    search({ caught: new Set() });
    expect(screen.queryByText(REASON)).toBeNull();
    expect(chip("Noch nicht gefangen").hasAttribute("aria-describedby")).toBe(false);
  });

  it("US-QS-15 the chip Leicht has no description: only the disabled chip points to the reason", () => {
    search({ caught: null });
    expect(chip("Leicht").hasAttribute("aria-describedby")).toBe(false);
  });
});

describe("US-QS-15 while the caught species still load, the disabled chip says nothing and the row keeps its height (issue 2615, CLS)", () => {
  const REASON = "Gefangene Arten sind unbekannt.";

  it("US-QS-15 loading: the chip Noch nicht gefangen is disabled, no reason text is in the document and the chip has no aria-describedby", () => {
    search({ caught: null, loading: true });
    const uncaught = chip("Noch nicht gefangen") as HTMLButtonElement;
    expect(uncaught.disabled).toBe(true);
    expect(uncaught.hasAttribute("aria-describedby")).toBe(false);
    expect(screen.queryByText(REASON)).toBeNull();
    expect(document.querySelector("[data-quick-row] p")).toBeNull();
  });

  it("US-QS-15 loading: Leicht still works and the chip row is the only child of the quick row besides the measuring row", async () => {
    search({ caught: null, loading: true });
    expect((chip("Leicht") as HTMLButtonElement).disabled).toBe(false);
    await userEvent.click(chip("Leicht"));
    expect(shown()).toEqual(["a", "b"]);
    const row = document.querySelector("[data-quick-row]");
    expect(
      [...(row?.children ?? [])].map((child) => child.getAttribute("role") ?? "measure"),
    ).toEqual(["group", "measure"]);
  });

  it("US-QS-15 loading: the layer checkbox Noch nicht gefangen is disabled too, as before", async () => {
    search({ caught: null, loading: true }, "/discover?view=catalog&sheet=filters");
    const layer = await screen.findByRole("dialog", { name: "Filter" });
    const box = within(layer).getByRole("checkbox", { name: "Noch nicht gefangen" });
    expect((box as HTMLInputElement).disabled).toBe(true);
  });

  it("US-QS-15 failed (no caught set, not loading): the visible reason shows as before and the chip points to it", () => {
    search({ caught: null, loading: false });
    const uncaught = chip("Noch nicht gefangen") as HTMLButtonElement;
    expect(uncaught.disabled).toBe(true);
    const why = document.getElementById(uncaught.getAttribute("aria-describedby") ?? "");
    expect(why?.tagName).toBe("P");
    expect(why?.textContent).toBe(REASON);
  });

  it("US-QS-15 no loading flag at all reads as not loading: a caller without it keeps the reason", () => {
    search({ caught: null });
    expect(screen.queryByText(REASON)).not.toBeNull();
  });

  it("US-QS-15 loaded: the chip is enabled, with no reason and no description", () => {
    search({ caught: new Set(["a"]), loading: false });
    const uncaught = chip("Noch nicht gefangen") as HTMLButtonElement;
    expect(uncaught.disabled).toBe(false);
    expect(uncaught.hasAttribute("aria-describedby")).toBe(false);
    expect(screen.queryByText(REASON)).toBeNull();
  });

  it("US-QS-15 loading then loaded: the chip becomes enabled and no reason ever shows in between", () => {
    const { rerender } = search({ caught: null, loading: true });
    expect(screen.queryByText(REASON)).toBeNull();
    rerender(tree(HITS, { caught: new Set(["a"]), loading: false }, "/discover?view=catalog"));
    expect(screen.queryByText(REASON)).toBeNull();
    expect((chip("Noch nicht gefangen") as HTMLButtonElement).disabled).toBe(false);
  });

  it("US-QS-15 loading then failed: the reason shows once the load has failed (P-10)", () => {
    const { rerender } = search({ caught: null, loading: true });
    expect(screen.queryByText(REASON)).toBeNull();
    rerender(tree(HITS, { caught: null, loading: false }, "/discover?view=catalog"));
    expect(screen.queryByText(REASON)).not.toBeNull();
    expect(chip("Noch nicht gefangen").getAttribute("aria-describedby")).toBeTruthy();
  });
});

describe('US-QS-15 · US-QS-21 the chips and the layer "Filter" are one state', () => {
  it("US-QS-15 · US-QS-21 the layer has the checkbox Noch nicht gefangen, checked while the chip is pressed, and the select shows Leicht", async () => {
    search(
      { caught: new Set(["a"]) },
      "/discover?view=catalog&difficulty=1&uncaught=1&sheet=filters",
    );
    const layer = await screen.findByRole("dialog", { name: "Filter" });
    const box = within(layer).getByRole("checkbox", { name: "Noch nicht gefangen" });
    expect((box as HTMLInputElement).checked).toBe(true);
    expect(
      (within(layer).getByRole("combobox", { name: "Schwierigkeit" }) as HTMLSelectElement).value,
    ).toBe("1");
  });

  it("US-QS-15 · US-QS-21 the checkbox and the select of the layer set the same filters as the chips, and the chips follow", async () => {
    search({ caught: new Set(["a"]) }, "/discover?view=catalog&sheet=filters");
    const layer = await screen.findByRole("dialog", { name: "Filter" });
    await userEvent.click(within(layer).getByRole("checkbox", { name: "Noch nicht gefangen" }));
    await userEvent.selectOptions(
      within(layer).getByRole("combobox", { name: "Schwierigkeit" }),
      "1",
    );
    expect(address()).toContain("uncaught=1");
    expect(address()).toContain("difficulty=1");
    await userEvent.click(within(layer).getByRole("button", { name: "Fertig" }));
    expect(pressed("Noch nicht gefangen")).toBe("true");
    expect(pressed("Leicht")).toBe("true");
    expect(shown()).toEqual(["b"]);
  });

  it("US-QS-15 · US-QS-21 while the caught species are not known the checkbox is disabled, like the chip", async () => {
    search({ caught: null }, "/discover?view=catalog&sheet=filters");
    const layer = await screen.findByRole("dialog", { name: "Filter" });
    const box = within(layer).getByRole("checkbox", { name: "Noch nicht gefangen" });
    expect((box as HTMLInputElement).disabled).toBe(true);
  });
});

describe("US-QS-15 · US-QS-21 the filters are counted and shown once", () => {
  it('US-QS-15 · US-QS-21 "Filter (n)" counts difficulty and uncaught once each, and the list of chosen filters repeats neither pressed chip', () => {
    search({ caught: new Set(["a"]) }, "/discover?view=catalog&difficulty=1&uncaught=1");
    expect(screen.getByRole("button", { name: "Filter (2)" })).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Gewählte Filter" })).toBeNull();
    expect(pressed("Leicht")).toBe("true");
    expect(pressed("Noch nicht gefangen")).toBe("true");
  });

  it('US-QS-15 · US-QS-21 "Nur meine Vorschläge" still shows as a removable chip beside the pressed toggle chips', async () => {
    search({ caught: new Set() }, "/discover?view=catalog&difficulty=1&own=1");
    expect(screen.getByRole("button", { name: "Filter (2)" })).toBeTruthy();
    const list = screen.getByRole("list", { name: "Gewählte Filter" });
    expect(
      within(list)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Nur meine Vorschläge ×"]);
  });

  it("US-QS-15 · US-QS-21 Mittel and Schwierig, which no toggle chip shows, stay in the list of chosen filters", () => {
    search({ caught: new Set() }, "/discover?view=catalog&difficulty=2");
    const list = screen.getByRole("list", { name: "Gewählte Filter" });
    expect(within(list).getByText(/Schwierigkeit: Mittel/)).toBeTruthy();
    expect(pressed("Leicht")).toBe("false");
  });

  it("US-QS-15 · US-QS-21 without quick filters difficulty Leicht still shows as a removable chip, as before", () => {
    search(undefined, "/discover?view=catalog&difficulty=1");
    const list = screen.getByRole("list", { name: "Gewählte Filter" });
    expect(within(list).getByText(/Schwierigkeit: Leicht/)).toBeTruthy();
  });

  it("US-QS-15 · US-QS-21 filters that match nothing offer to reset, and the reset takes both chips off", async () => {
    search(
      { caught: new Set(["a", "b", "c", "d"]) },
      "/discover?view=catalog&difficulty=1&uncaught=1&own=1",
    );
    expect(screen.getByText("Keine Art passt zu den Filtern")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Filter zurücksetzen" }));
    expect(address()).toBe("/discover?view=catalog");
    expect(pressed("Leicht")).toBe("false");
    expect(pressed("Noch nicht gefangen")).toBe("false");
    expect(shown()).toEqual(["a", "b", "c", "d"]);
  });
});

describe("US-QS-15 the chip row decides with the real fitting logic (useChipsFit, the same as the group jump)", () => {
  /** The form the row shows: the chips that wrap, or one line that scrolls sideways. */
  const form = () =>
    screen.getByRole("group", { name: "Schnellfilter" }).className.includes("overflow-x-auto")
      ? "scroll"
      : "chips";

  it("US-QS-15 chips that fit the row on one line wrap and do not scroll", () => {
    layout = { row: 340, chips: [90, 170] };
    search({ caught: new Set() });
    expect(form()).toBe("chips");
  });

  it("US-QS-15 issue 2612 at 360 px both pressed chips (317 px) need two lines in the 294 px row: they wrap, none is cut at the edge of the row", () => {
    layout = { row: 294, chips: [105, 204] };
    search({ caught: new Set() });
    expect(form()).toBe("chips");
    const group = screen.getByRole("group", { name: "Schnellfilter" });
    expect(group.className).toContain("flex-wrap");
    expect(group.className).not.toContain("overflow-x-auto");
  });

  it("US-QS-15 issue 2612 the form does not depend on the chosen chips: the decision reads the widest (pressed) form, so pressing a chip never switches between wrapping and scrolling", async () => {
    layout = { row: 294, chips: [105, 204] };
    search({ caught: new Set() });
    expect(form()).toBe("chips");
    await userEvent.click(chip("Leicht"));
    await userEvent.click(chip("Noch nicht gefangen"));
    expect(form()).toBe("chips");
    await userEvent.click(chip("Leicht"));
    await userEvent.click(chip("Noch nicht gefangen"));
    expect(form()).toBe("chips");
  });

  it("US-QS-15 below 768 px a chip that is wider than the row (large text) cannot wrap: the chips stay in one line that scrolls sideways, the next one peeking in", () => {
    layout = { row: 294, chips: [210, 408] };
    search({ caught: new Set() });
    expect(form()).toBe("scroll");
  });

  it("US-QS-15 a resize that makes the chips fit again changes the form through the ResizeObserver", () => {
    layout = { row: 300, chips: [90, 330] };
    search({ caught: new Set() });
    expect(form()).toBe("scroll");
    layout = { row: 340, chips: [90, 330] };
    act(() => {
      for (const callback of [...observers]) callback([], {} as ResizeObserver);
    });
    expect(form()).toBe("chips");
  });

  it("US-QS-15 the measuring row draws every chip in its widest form (pressed), hidden from assistive technology and without a tab stop", () => {
    search({ caught: new Set() });
    const measure = document.querySelector("[data-quick-measure]");
    const box = measure?.parentElement;
    expect(box?.getAttribute("aria-hidden")).toBe("true");
    expect(box?.hasAttribute("inert")).toBe(true);
    const chips = [...(measure?.querySelectorAll("button") ?? [])];
    expect(chips.map((b) => b.textContent)).toEqual(["Leicht", "Noch nicht gefangen"]);
    for (const b of chips) {
      expect(b.getAttribute("tabindex")).toBe("-1");
      expect(b.querySelector("svg")).not.toBeNull();
      expect(b.className).toContain("border-2");
    }
    // The real chips are in the accessibility tree once; the measuring ones are not.
    expect(screen.getAllByRole("button", { name: "Leicht" })).toHaveLength(1);
  });
});
