// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { GroupJump, type GroupChoice } from "./group-jump";
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

const jumped: string[] = [];
const onJump = (key: string) => {
  jumped.push(key);
};

beforeEach(() => {
  setViewportWidth(360);
  layout = { row: 300 };
  jumped.length = 0;
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

const tree = (choices: GroupChoice[]) => (
  <GroupJump label="Zum Standort springen" choices={choices} onJump={onJump} />
);

function show(choices: GroupChoice[]) {
  return render(tree(choices));
}

/** The form the row shows now: the chips that wrap, the chips that scroll sideways, or nothing. */
const formOf = () => {
  const row = screen.queryByRole("group", { name: "Zum Standort springen" });
  if (row === null) return "none";
  return row.className.includes("overflow-x-auto") ? "scroll" : "chips";
};

describe("US-QS-15 · SG-LIST-06 group jump: chips on one or two lines, otherwise a chip row that scrolls sideways (issue 1281, issue 2421)", () => {
  it("US-QS-15 below 768 px chips that fit one line show as a row, without a scroll", () => {
    layout = { row: 300, chips: [90, 90, 90] };
    show(choicesOf(3));
    const row = screen.getByRole("group", { name: "Zum Standort springen" });
    expect(screen.getAllByRole("button")).toHaveLength(3);
    // The chip row is the marked `chips` region of the one-screen gate (DS-63, issue 2417); it wraps, so it does not scroll.
    expect(row.getAttribute("data-scroll-x")).toBe("chips");
    expect(row.className).not.toContain("overflow-x-auto");
    expect(row.className).toContain("flex-wrap");
  });

  it("US-QS-15 below 768 px chips that need two lines show as a chip row that scrolls sideways, though two lines fit twice the width", () => {
    layout = { row: 300, chips: [120, 120, 120, 120] };
    show(choicesOf(4));
    expect(formOf()).toBe("scroll");
  });

  it("US-QS-15 from 768 px chips that take two lines show as a row of choices", () => {
    setViewportWidth(800);
    layout = { row: 300, chips: [120, 120, 120, 120] };
    show(choicesOf(4));
    expect(formOf()).toBe("chips");
  });

  it("US-QS-15 from 768 px chips that need three lines show as a chip row that scrolls sideways", () => {
    setViewportWidth(800);
    layout = { row: 300, chips: [120, 120, 120, 120, 120, 120] };
    show(choicesOf(6));
    expect(formOf()).toBe("scroll");
  });

  it("US-QS-15 a single chip wider than the row shows as a chip row that scrolls sideways", () => {
    setViewportWidth(800);
    layout = { row: 300, chips: [400] };
    show(choicesOf(1));
    expect(formOf()).toBe("scroll");
  });

  it("US-QS-15 a resize across 768 px switches the form both ways", () => {
    layout = { row: 300, chips: [120, 120, 120, 120] };
    show(choicesOf(4));
    expect(formOf()).toBe("scroll");
    act(() => setViewportWidth(800));
    expect(formOf()).toBe("chips");
    act(() => setViewportWidth(360));
    expect(formOf()).toBe("scroll");
  });

  it("US-QS-15 · SG-LIST-06 a chip jumps to its group and is no filter: it holds no pressed state and no check mark", async () => {
    layout = { row: 300, chips: [90, 90, 90] };
    show(choicesOf(3));
    await userEvent.click(screen.getByRole("button", { name: /Gruppe 3/ }));
    expect(jumped).toEqual(["g3"]);
    const chips = screen.getAllByRole("button", { name: /Gruppe/ });
    for (const chip of chips) {
      expect(chip.hasAttribute("aria-pressed")).toBe(false);
      expect(chip.querySelector("svg")).toBeNull();
    }
    expect(formOf()).toBe("chips");
  });

  it("US-QS-32 · SG-BTN-01 every chip is plain (no outline look), none is chosen", () => {
    layout = { row: 300, chips: [90, 90, 90] };
    show(choicesOf(3));
    for (const chip of screen.getAllByRole("button", { name: /Gruppe/ })) {
      const classes = chip.className.split(/\s+/);
      expect(classes).toContain("text-primary");
      expect(classes.some((c) => /^(border|bg)(-|$)/.test(c))).toBe(false);
    }
  });

  it("US-QS-15 · SG-LIST-06 · issue 2421 the chips of the scrolling row are the same buttons with the same names and counts, and a chip jumps", async () => {
    layout = { row: 300, chips: [200, 200, 200] };
    show(choicesOf(3));
    expect(formOf()).toBe("scroll");
    const row = screen.getByRole("group", { name: "Zum Standort springen" });
    // It is the marked sideways region 'chips' (DS-63); no selection field is left.
    expect(row.getAttribute("data-scroll-x")).toBe("chips");
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getAllByRole("button", { name: /Gruppe/ }).map((b) => b.textContent)).toEqual([
      "Gruppe 1 (1)",
      "Gruppe 2 (2)",
      "Gruppe 3 (3)",
    ]);
    await userEvent.click(screen.getByRole("button", { name: /Gruppe 2/ }));
    expect(jumped).toEqual(["g2"]);
    expect(formOf()).toBe("scroll");
  });

  it("US-QS-15 · WCAG 2.1.1 the keyboard reaches every chip of the scrolling row, and the chip keeps the focus after it jumped", async () => {
    layout = { row: 300, chips: [200, 200, 200] };
    show(choicesOf(3));
    const chip = screen.getByRole("button", { name: /Gruppe 3/ });
    chip.focus();
    await userEvent.keyboard("{Enter}");
    expect(jumped).toEqual(["g3"]);
    expect(document.activeElement).toBe(chip);
  });

  it("US-QS-15 a row that starts without choices becomes a scrolling chip row once its choices are too wide", () => {
    layout = { row: 300, chips: [200, 200, 200] };
    const { rerender } = render(tree([]));
    expect(formOf()).toBe("none");
    rerender(tree(choicesOf(3)));
    expect(formOf()).toBe("scroll");
  });

  it("US-QS-15 changed counts re-decide: chips that grow past the row become a scrolling chip row", () => {
    layout = { row: 330 };
    const { rerender } = render(tree(choicesOf(3, [1, 2, 3])));
    expect(formOf()).toBe("chips");
    rerender(tree(choicesOf(3, [100, 100, 100])));
    expect(formOf()).toBe("scroll");
  });

  it("US-QS-15 a change of the chips' widths without a render re-decides through the ResizeObserver", () => {
    layout = { row: 330, chips: [100, 100, 100] };
    show(choicesOf(3));
    expect(formOf()).toBe("chips");
    resize({ row: 330, chips: [200, 200, 200] });
    expect(formOf()).toBe("scroll");
  });

  it("US-QS-15 the measuring row is hidden from assistive technology and cannot take the focus", () => {
    show(choicesOf(3));
    const box = document.querySelector("[data-group-measure]")?.parentElement;
    expect(box?.getAttribute("aria-hidden")).toBe("true");
    expect(box?.hasAttribute("inert")).toBe(true);
    for (const b of Array.from(document.querySelectorAll("[data-group-measure] button"))) {
      expect(b.getAttribute("tabindex")).toBe("-1");
    }
  });

  it("US-QS-15 without a measurable layout the chips show (the default)", () => {
    layout = { row: 0 };
    show(choicesOf(7));
    expect(formOf()).toBe("chips");
  });

  it("US-QS-15 without matchMedia the row counts as narrow: one line only", () => {
    const saved = window.matchMedia;
    (window as { matchMedia?: unknown }).matchMedia = undefined;
    try {
      layout = { row: 300, chips: [120, 120, 120, 120] };
      show(choicesOf(4));
      expect(formOf()).toBe("scroll");
    } finally {
      window.matchMedia = saved;
    }
  });
});

describe("US-ACH-02 group chips say what they count (countText)", () => {
  it("US-ACH-02 countText replaces the count in brackets in the chips, the measure and the scrolling row", () => {
    const choices: GroupChoice[] = [
      { key: "g1", label: "Pflege", count: 3, countText: "2 von 3" },
      { key: "g2", label: "Wachstum", count: 2, countText: "0 von 2" },
    ];
    layout = { row: 300, chips: [90, 90] };
    show(choices);
    expect(screen.getByRole("button", { name: "Pflege · 2 von 3" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Wachstum · 0 von 2" })).toBeTruthy();
    expect(document.querySelector("[data-group-measure]")?.textContent).toBe(
      "Pflege · 2 von 3Wachstum · 0 von 2",
    );
    expect(document.body.textContent).not.toMatch(/\(\d+\)/);
    cleanup();
    layout = { row: 300, chips: [200, 200] };
    show(choices);
    expect(formOf()).toBe("scroll");
    expect(screen.getByRole("button", { name: "Pflege · 2 von 3" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Wachstum · 0 von 2" })).toBeTruthy();
  });
});

describe("US-QS-15 the wrap is simulated greedily, not by the sum of the widths", () => {
  it("US-QS-15 two chips that pack badly need three lines in a row that holds 2 x their sum", () => {
    // 200 + 8 + 200 > 300, so each 200 px chip takes its own line; the 100 px chip then needs a third line.
    expect(linesNeeded([200, 200, 100], 8, 300)).toBe(3);
    expect(linesNeeded([120, 120, 120, 120], 8, 300)).toBe(2);
    expect(linesNeeded([400], 8, 300)).toBeNull();
    expect(linesNeeded([], 8, 300)).toBe(1);
  });
});
