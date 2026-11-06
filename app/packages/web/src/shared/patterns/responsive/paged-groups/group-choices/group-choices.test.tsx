// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { GroupChoices, type GroupChoice } from "./group-choices";
import { linesNeeded } from "./use-chips-fit";

/** The layout of the test: the width of the row, and the widths of the chips in their measured form (px). Without
 * `chips`, a chip is 8 px per character of its text (so a new count changes its width). */
let layout: { row: number; chips?: number[] } = { row: 300 };
const CHAR_PX = 8;
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

beforeEach(() => {
  setViewportWidth(360);
  layout = { row: 300 };
  observers.length = 0;
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    let width = 0;
    if (this.hasAttribute("data-group-row")) width = layout.row;
    else if (this.parentElement?.hasAttribute("data-group-measure")) {
      const index = Array.from(this.parentElement.children).indexOf(this);
      width = layout.chips?.[index] ?? (this.textContent ?? "").length * CHAR_PX;
    }
    return { width, height: 0, top: 0, left: 0, right: width, bottom: 0, x: 0, y: 0, toJSON() {} };
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A resize of the window, a text size or a late font: the layout reports new widths and the observers run. */
function resize(next: typeof layout) {
  layout = next;
  act(() => {
    for (const callback of [...observers]) callback([], {} as ResizeObserver);
  });
}

/** `n` choices with the counts 1, 2, 3 …, named "Gruppe 1" …, the keys the same. */
const choicesOf = (n: number, counts?: number[]): GroupChoice[] =>
  Array.from({ length: n }, (_, i) => ({
    key: `g${i + 1}`,
    label: `Gruppe ${i + 1}`,
    count: counts?.[i] ?? i + 1,
  }));

/** Shows the address next to the row, so a test can read `part=` and `from=`. */
function Address() {
  const location = useLocation();
  return <p data-testid="address">{location.search}</p>;
}

const tree = (choices: GroupChoice[]) => (
  <MemoryRouter initialEntries={["/collection?view=plants"]}>
    <GroupChoices label="Standorte" choices={choices} />
    <Address />
  </MemoryRouter>
);

function show(choices: GroupChoice[], at = "/collection?view=plants") {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <GroupChoices label="Standorte" choices={choices} />
      <Address />
    </MemoryRouter>,
  );
}

/** The form the row shows now: the chips, the selection field, or nothing. */
const formOf = () =>
  screen.queryByRole("combobox", { name: "Standorte" })
    ? "select"
    : screen.queryByRole("group", { name: "Standorte" })
      ? "chips"
      : "none";

const address = () => screen.getByTestId("address").textContent ?? "";

describe("US-QS-19 · US-QS-15 group choices: chips on one or two lines, otherwise a selection field (issue 1281)", () => {
  it("US-QS-19 below 768 px chips that fit one line show as a row, without a scroll", () => {
    layout = { row: 300, chips: [90, 90, 90] };
    show(choicesOf(3));
    const row = screen.getByRole("group", { name: "Standorte" });
    expect(screen.getAllByRole("button")).toHaveLength(3);
    expect(row.hasAttribute("data-scroll-x")).toBe(false);
    expect(row.className).not.toContain("overflow-x-auto");
    expect(row.className).toContain("flex-wrap");
  });

  it("US-QS-19 below 768 px chips that need two lines show as a selection field, though two lines fit twice the width", () => {
    layout = { row: 300, chips: [120, 120, 120, 120] };
    show(choicesOf(4));
    expect(formOf()).toBe("select");
  });

  it("US-QS-19 from 768 px chips that take two lines show as a row of choices", () => {
    setViewportWidth(800);
    layout = { row: 300, chips: [120, 120, 120, 120] };
    show(choicesOf(4));
    expect(formOf()).toBe("chips");
  });

  it("US-QS-19 from 768 px chips that need three lines show as a selection field", () => {
    setViewportWidth(800);
    layout = { row: 300, chips: [120, 120, 120, 120, 120, 120] };
    show(choicesOf(6));
    expect(formOf()).toBe("select");
  });

  it("US-QS-19 a single chip wider than the row shows as a selection field", () => {
    setViewportWidth(800);
    layout = { row: 300, chips: [400] };
    show(choicesOf(1));
    expect(formOf()).toBe("select");
  });

  it("US-QS-15 · US-QS-19 a resize across 768 px switches the form both ways", () => {
    layout = { row: 300, chips: [120, 120, 120, 120] };
    show(choicesOf(4));
    expect(formOf()).toBe("select");
    act(() => setViewportWidth(800));
    expect(formOf()).toBe("chips");
    act(() => setViewportWidth(360));
    expect(formOf()).toBe("select");
  });

  it("US-QS-19 choosing a chip never changes the form, the measure draws every chip in its widest form", async () => {
    layout = { row: 300, chips: [90, 90, 90] };
    show(choicesOf(3), "/collection?view=plants&part=g1");
    const measured = Array.from(document.querySelectorAll("[data-group-measure] button"));
    expect(measured).toHaveLength(3);
    expect(measured.every((b) => b.textContent?.includes("✓"))).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: /Gruppe 3/ }));
    expect(formOf()).toBe("chips");
    expect(screen.getByRole("button", { name: /Gruppe 3/ }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("US-QS-19 choosing in the selection field keeps the selection field", async () => {
    layout = { row: 300, chips: [200, 200, 200] };
    show(choicesOf(3), "/collection?view=plants&part=g1");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Standorte" }), "g2");
    expect(formOf()).toBe("select");
  });

  it("US-QS-19 the selection field shows the group chosen in the address", () => {
    layout = { row: 300, chips: [200, 200, 200] };
    show(choicesOf(3), "/collection?view=plants&part=g2");
    expect((screen.getByRole("combobox", { name: "Standorte" }) as HTMLSelectElement).value).toBe(
      "g2",
    );
  });

  it("US-QS-19 choosing in the selection field writes part= and removes the first entry", async () => {
    layout = { row: 300, chips: [200, 200, 200] };
    show(choicesOf(3), "/collection?view=plants&part=g1&from=6");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Standorte" }), "g3");
    expect(address()).toContain("part=g3");
    expect(address()).not.toContain("from=");
  });

  it("US-QS-19 choosing a chip writes part= and removes the first entry", async () => {
    show(choicesOf(2), "/collection?view=plants&from=3");
    await userEvent.click(screen.getByRole("button", { name: /Gruppe 2/ }));
    expect(address()).toContain("part=g2");
    expect(address()).not.toContain("from=");
  });

  it("US-QS-15 · US-QS-19 the keyboard focus stays on the selection field after choosing", async () => {
    layout = { row: 300, chips: [200, 200, 200] };
    show(choicesOf(3));
    const select = screen.getByRole("combobox", { name: "Standorte" });
    select.focus();
    await userEvent.selectOptions(select, "g3");
    expect(document.activeElement).toBe(select);
  });

  it("US-QS-19 a row that starts without choices becomes a selection field once its choices are too wide", () => {
    layout = { row: 300, chips: [200, 200, 200] };
    const { rerender } = render(tree([]));
    expect(formOf()).toBe("none");
    rerender(tree(choicesOf(3)));
    expect(formOf()).toBe("select");
  });

  it("US-QS-19 changed counts re-decide: chips that grow past the row become a selection field", () => {
    layout = { row: 330 };
    const { rerender } = render(tree(choicesOf(3, [1, 2, 3])));
    expect(formOf()).toBe("chips");
    rerender(tree(choicesOf(3, [100, 100, 100])));
    expect(formOf()).toBe("select");
  });

  it("US-QS-15 · US-QS-19 a change of the chips' widths without a render re-decides through the ResizeObserver", () => {
    layout = { row: 330, chips: [100, 100, 100] };
    show(choicesOf(3));
    expect(formOf()).toBe("chips");
    resize({ row: 330, chips: [200, 200, 200] });
    expect(formOf()).toBe("select");
  });

  it("US-QS-19 the measuring row is hidden from assistive technology and cannot take the focus", () => {
    show(choicesOf(3));
    const box = document.querySelector("[data-group-measure]")?.parentElement;
    expect(box?.getAttribute("aria-hidden")).toBe("true");
    expect(box?.hasAttribute("inert")).toBe(true);
    for (const b of Array.from(document.querySelectorAll("[data-group-measure] button"))) {
      expect(b.getAttribute("tabindex")).toBe("-1");
    }
  });

  it("US-QS-19 without a measurable layout the chips show (the default)", () => {
    layout = { row: 0 };
    show(choicesOf(7));
    expect(formOf()).toBe("chips");
  });

  it("US-QS-19 without matchMedia the row counts as narrow: one line only", () => {
    const saved = window.matchMedia;
    (window as { matchMedia?: unknown }).matchMedia = undefined;
    try {
      layout = { row: 300, chips: [120, 120, 120, 120] };
      show(choicesOf(4));
      expect(formOf()).toBe("select");
    } finally {
      window.matchMedia = saved;
    }
  });
});

describe("US-QS-19 the wrap is simulated greedily, not by the sum of the widths", () => {
  it("US-QS-19 two chips that pack badly need three lines in a row that holds 2 x their sum", () => {
    // 200 + 8 + 200 > 300, so each 200 px chip takes its own line; the 100 px chip then needs a third line.
    expect(linesNeeded([200, 200, 100], 8, 300)).toBe(3);
    expect(linesNeeded([120, 120, 120, 120], 8, 300)).toBe(2);
    expect(linesNeeded([400], 8, 300)).toBeNull();
    expect(linesNeeded([], 8, 300)).toBe(1);
  });
});
