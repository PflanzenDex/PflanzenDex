// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Table scroll container (US-QS-15, DS-63, issue 2417)", () => {
  it("US-QS-15 the scroll container of a table is the marked table region of the one-screen gate", () => {
    render(sample());
    const region = screen.getByRole("region", { name: "Tabelle" });
    expect(region.getAttribute("data-scroll-x")).toBe("table");
  });
});

/** The class names of an element as a list: `toContain` on a list matches whole classes, not parts of a class. */
const classesOf = (el: Element) => el.className.split(/\s+/);

/** The number of a `z-<n>` class, with or without the `first:` variant; 0 when there is none. */
function zOf(el: Element, variant = ""): number {
  const prefix = `${variant}z-`;
  const found = classesOf(el).find(
    (c) => c.startsWith(prefix) && /^\d+$/.test(c.slice(prefix.length)),
  );
  return found ? Number(found.slice(prefix.length)) : 0;
}

function framed() {
  return (
    <Table>
      <TableCaption>Pflanzen</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Standort</TableHead>
          <TableHead>Raum</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableHead scope="row">Monstera</TableHead>
          <TableCell>Fenster</TableCell>
          <TableCell>Wohnzimmer</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Efeutute</TableCell>
          <TableCell>Regal</TableCell>
          <TableCell>Flur</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

describe("Table keeps its header row and first column (US-QS-15, DS-58, DS-61, DS-63, SG-LIST-01, issue 2420)", () => {
  it("US-QS-15 · DS-61 the scroll container is a marked scroll region, and it stays a table region for sideways scroll", () => {
    render(framed());
    const region = screen.getByRole("region", { name: "Tabelle" });
    expect(region.hasAttribute("data-scroll-region")).toBe(true);
    expect(region.getAttribute("data-scroll-x")).toBe("table");
  });

  it("US-QS-15 · DS-61 the region scrolls down and sideways inside itself and never passes the scroll on to the page", () => {
    render(framed());
    const classes = classesOf(screen.getByRole("region", { name: "Tabelle" }));
    expect(classes).toContain("overflow-auto");
    expect(classes).toContain("overscroll-contain");
    expect(classes).not.toContain("overflow-x-auto");
  });

  it("US-QS-15 · DS-58 the region takes the height that is left in its frame, one row and a bit at least", () => {
    render(framed());
    const classes = classesOf(screen.getByRole("region", { name: "Tabelle" }));
    expect(classes).toContain("flex-1");
    expect(classes).toContain("min-h-24");
    expect(classes).toContain("min-w-0");
  });

  it("US-QS-15 · SG-LIST-02 below 768 px the region keeps the room of the bottom bar as scroll padding, and the header's height at the top", () => {
    render(framed());
    const classes = classesOf(screen.getByRole("region", { name: "Tabelle" }));
    expect(classes).toContain("scroll-pb-(--bar-clearance)");
    expect(classes).toContain("md:scroll-pb-0");
    expect(classes).toContain("scroll-pt-11");
  });

  it("US-QS-15 · DS-37 the region is a tab stop with a name, so the keyboard scrolls it", () => {
    render(framed());
    const region = screen.getByRole("region", { name: "Tabelle" });
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(classesOf(region)).toContain("focus-visible:ring-2");
  });

  it("US-QS-15 · SG-LIST-01 every cell of the header row sticks to the top of the region", () => {
    render(framed());
    const headers = screen.getAllByRole("columnheader");
    expect(headers).toHaveLength(3);
    for (const head of headers) {
      expect(classesOf(head)).toContain("sticky");
      expect(classesOf(head)).toContain("top-0");
    }
  });

  it("US-QS-15 · SG-LIST-01 the first cell of every row sticks to the left of the region, a row header or not", () => {
    render(framed());
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      const first = row.firstElementChild as HTMLElement;
      expect(classesOf(first)).toContain("first:sticky");
      expect(classesOf(first)).toContain("first:left-0");
      // Only the first one: the `first:` variant leaves the cells after it alone, so they scroll away under it. A cell
      // with a plain `sticky` or `left-0` would stick wherever it stands.
      for (const cell of Array.from(row.children)) {
        expect(classesOf(cell)).not.toContain("sticky");
        expect(classesOf(cell)).not.toContain("left-0");
      }
    }
    expect(classesOf(screen.getByText("Monstera"))).toContain("first:sticky");
  });

  it("US-QS-15 · SG-LIST-01 the top-left corner sticks both ways and lies above the header row and the first column", () => {
    render(framed());
    const [corner, second] = screen.getAllByRole("columnheader") as [HTMLElement, HTMLElement];
    // The `first:` variant makes only the first header cell stick to the left as well; no header cell has a plain `left-0`.
    expect(classesOf(corner)).toContain("first:left-0");
    expect(classesOf(second)).not.toContain("left-0");
    const firstColumn = screen.getByText("Efeutute");
    // Header cells pass over the first column while the rows scroll up; the corner passes over both.
    expect(zOf(second)).toBeGreaterThan(zOf(firstColumn, "first:"));
    expect(zOf(corner, "first:")).toBeGreaterThan(zOf(second));
    expect(zOf(corner, "first:")).toBeGreaterThan(zOf(firstColumn, "first:"));
  });

  it("US-QS-15 · DS-61 a sticky cell is opaque with a token colour and has a line of its own, so the cells under it do not show through", () => {
    render(framed());
    const region = screen.getByRole("region", { name: "Tabelle" });
    const sticky = [...screen.getAllByRole("columnheader"), screen.getByText("Efeutute")];
    for (const cell of sticky) {
      const classes = classesOf(cell);
      expect(classes.some((c) => /^(first:)?bg-card$/.test(c))).toBe(true);
      expect(classes).toContain("border-border");
    }
    // The first column is divided from the cells that scroll under it, and the header row from the rows.
    expect(classesOf(screen.getAllByRole("columnheader")[1] as HTMLElement)).toContain("border-b");
    expect(classesOf(screen.getByText("Efeutute"))).toContain("first:border-r");
    // The region has the same surface, so the cells that stay look like the ones around them.
    expect(classesOf(region)).toContain("bg-card");
    // No hard-coded colour anywhere (DS-30).
    expect(region.outerHTML).not.toMatch(/#[0-9a-f]{3,8}\b|bg-white|bg-\[/i);
  });

  it("US-QS-15 · SG-LIST-01 the lines of the rows are on the cells, because separated borders let a sticky cell keep its line", () => {
    render(framed());
    expect(classesOf(screen.getByRole("table"))).toContain("border-separate");
    expect(classesOf(screen.getByRole("table"))).toContain("border-spacing-0");
  });

  it("US-QS-15 · DS-24 a row header is a th with scope row, and the header row keeps scope col", () => {
    render(framed());
    const rowHeader = screen.getByRole("rowheader", { name: "Monstera" });
    expect(rowHeader.tagName).toBe("TH");
    expect(rowHeader.getAttribute("scope")).toBe("row");
    expect(classesOf(rowHeader)).toContain("first:sticky");
    // A row header in the body does not stick to the top: it is no column header.
    expect(classesOf(rowHeader)).not.toContain("top-0");
    for (const head of screen.getAllByRole("columnheader")) {
      expect(head.getAttribute("scope")).toBe("col");
    }
  });

  it("US-QS-15 · DS-24 the caption, the parts and their ref and class API stay", () => {
    const ref = createRef<HTMLTableElement>();
    render(
      <Table ref={ref} className="min-w-[40rem]" containerClassName="h-40" containerLabel="Liste">
        <TableCaption>Pflanzen</TableCaption>
        <TableBody>
          <TableRow>
            <TableCell className="px-9">x</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(screen.getByRole("table", { name: "Pflanzen" })).toBe(ref.current);
    expect(classesOf(ref.current as HTMLElement)).toContain("min-w-[40rem]");
    expect(classesOf(screen.getByRole("region", { name: "Liste" }))).toContain("h-40");
    expect(classesOf(screen.getByText("x"))).toContain("px-9");
  });
});

/** The name of the variable that carries the width of the first column; the class of the region reads it. */
const FIRST_COLUMN = "--table-first-col";

/** A ResizeObserver that jsdom lacks: it keeps what is observed and lets the test call the callbacks. */
function stubResizeObserver() {
  const seen: { observed: Element[]; disconnected: boolean; run: () => void }[] = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      readonly entry: (typeof seen)[number];
      constructor(callback: () => void) {
        this.entry = { observed: [], disconnected: false, run: callback };
        seen.push(this.entry);
      }
      observe(element: Element) {
        this.entry.observed.push(element);
      }
      unobserve(element: Element) {
        this.entry.observed = this.entry.observed.filter((e) => e !== element);
      }
      disconnect() {
        this.entry.disconnected = true;
      }
    },
  );
  return seen;
}

/** Layout that jsdom lacks: a cell of the first column is `first.width` px wide, every other cell 90 px. */
function stubColumnWidths(first: { width: number }) {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const isFirst = this instanceof HTMLTableCellElement && this.cellIndex === 0;
    const width = isFirst ? first.width : this instanceof HTMLTableCellElement ? 90 : 0;
    return { width, height: 44, top: 0, left: 0, right: width, bottom: 44, x: 0, y: 0 } as DOMRect;
  });
}

/** Layout that jsdom lacks: the region is `box.width` px wide inside (`clientWidth`), as far as the table judges its first column. */
function stubRegionWidth(box: { width: number }) {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.hasAttribute("data-scroll-region") ? box.width : 0;
  });
}

describe("Table keeps a focused control clear of its first column (US-QS-15, WCAG 2.4.11, issue 2573)", () => {
  const region = () => screen.getByRole("region", { name: "Tabelle" });

  it("US-QS-15 · 2.4.11 the region takes scroll padding for all three sticky parts: the first column, the header row and the bar", () => {
    render(framed());
    const classes = classesOf(region());
    expect(classes).toContain(`scroll-pl-(${FIRST_COLUMN})`);
    expect(classes).toContain("scroll-pt-11");
    expect(classes).toContain("scroll-pb-(--bar-clearance)");
    expect(classes).toContain("md:scroll-pb-0");
  });

  it("US-QS-15 · 2.4.11 the scroll padding on top is as high as the header row, and both follow the same size", () => {
    render(framed());
    // `scroll-pt-11` and `h-11` are the same length (11 spacing steps, in rem), so they grow together at 200 % text.
    for (const head of screen.getAllByRole("columnheader"))
      expect(classesOf(head)).toContain("h-11");
    expect(classesOf(region())).toContain("scroll-pt-11");
  });

  it("US-QS-15 · 2.4.11 the region writes the measured width of the first column as a variable, before it shows", () => {
    stubResizeObserver();
    stubColumnWidths({ width: 132.5 });
    render(framed());
    expect(region().style.getPropertyValue(FIRST_COLUMN)).toBe("132.5px");
  });

  it("US-QS-15 · 2.4.11 the width comes from the first cell of the table, and the cells after it do not count", () => {
    stubResizeObserver();
    stubColumnWidths({ width: 61 });
    render(framed());
    expect(region().style.getPropertyValue(FIRST_COLUMN)).toBe("61px");
  });

  it("US-QS-15 · 2.4.11 the region measures again when the first column changes its size", () => {
    const seen = stubResizeObserver();
    const first = { width: 100 };
    stubColumnWidths(first);
    render(framed());
    expect(region().style.getPropertyValue(FIRST_COLUMN)).toBe("100px");
    first.width = 188;
    act(() => seen.forEach((entry) => entry.run()));
    expect(region().style.getPropertyValue(FIRST_COLUMN)).toBe("188px");
  });

  it("US-QS-15 · 2.4.11 the region watches itself, the table and its first cell, and lets go of all when it unmounts", () => {
    const seen = stubResizeObserver();
    stubColumnWidths({ width: 100 });
    const { unmount } = render(framed());
    const [entry] = seen;
    expect(seen).toHaveLength(1);
    expect(entry?.observed).toContain(region());
    expect(entry?.observed).toContain(screen.getByRole("table"));
    expect(entry?.observed).toContain(screen.getByRole("columnheader", { name: "Name" }));
    unmount();
    expect(entry?.disconnected).toBe(true);
  });

  it("US-QS-15 · 2.4.11 the region follows a first cell that is replaced, and watches the new one", () => {
    const seen = stubResizeObserver();
    stubColumnWidths({ width: 100 });
    const { rerender } = render(framed());
    const old = screen.getByRole("columnheader", { name: "Name" });
    rerender(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead key="other">Art</TableHead>
          </TableRow>
        </TableHeader>
      </Table>,
    );
    act(() => seen.forEach((entry) => entry.run()));
    const now = screen.getByRole("columnheader", { name: "Art" });
    expect(seen[0]?.observed).toContain(now);
    expect(seen[0]?.observed).not.toContain(old);
  });

  it("US-QS-15 · 2.4.11 a table that is hidden (no width) leaves no padding, and gets it back when it shows", () => {
    const seen = stubResizeObserver();
    const first = { width: 0 };
    stubColumnWidths(first);
    render(framed());
    // No variable: the class reads an unset variable, so the scroll padding is 0, as before.
    expect(region().style.getPropertyValue(FIRST_COLUMN)).toBe("");
    first.width = 140;
    act(() => seen.forEach((entry) => entry.run()));
    expect(region().style.getPropertyValue(FIRST_COLUMN)).toBe("140px");
    first.width = 0;
    act(() => seen.forEach((entry) => entry.run()));
    expect(region().style.getPropertyValue(FIRST_COLUMN)).toBe("");
  });

  it("US-QS-15 · 2.4.11 a browser without a ResizeObserver measures once and does not fail", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    stubColumnWidths({ width: 77 });
    render(framed());
    expect(region().style.getPropertyValue(FIRST_COLUMN)).toBe("77px");
  });

  it("US-QS-15 · 2.4.11 a table without rows has nothing to measure and sets no variable", () => {
    stubResizeObserver();
    stubColumnWidths({ width: 77 });
    render(<Table />);
    expect(region().style.getPropertyValue(FIRST_COLUMN)).toBe("");
  });

  it("US-QS-15 · DS-36 the caller's ref still reaches the table, and the caller's classes still win", () => {
    stubResizeObserver();
    stubColumnWidths({ width: 100 });
    const ref = createRef<HTMLTableElement>();
    render(
      <Table ref={ref} containerClassName="scroll-pl-4">
        <TableBody>
          <TableRow>
            <TableCell>x</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(ref.current).toBe(screen.getByRole("table"));
    // The caller's `scroll-pl-4` replaces the class of the region (the class merge knows the group, DS-31).
    expect(classesOf(region())).toContain("scroll-pl-4");
    expect(classesOf(region())).not.toContain(`scroll-pl-(${FIRST_COLUMN})`);
  });
});

/** The attribute of the region that says whether the first column sticks or is loose (`useFirstColumn`). */
const firstColOf = (el: HTMLElement) => el.getAttribute("data-first-col");

describe("Table lets a wide first column loose (US-QS-15, WCAG 2.4.11, issue 2601)", () => {
  const region = () => screen.getByRole("region", { name: "Tabelle" });

  it("US-QS-15 · 2.4.11 the first column sticks while it takes at most half of the region", () => {
    stubResizeObserver();
    stubColumnWidths({ width: 164 });
    stubRegionWidth({ width: 328 });
    render(framed());
    expect(firstColOf(region())).toBe("sticky");
    expect(region().style.getPropertyValue(FIRST_COLUMN)).toBe("164px");
  });

  it("US-QS-15 · 2.4.11 a first column wider than half of the region is loose, and the variable of the scroll padding is gone", () => {
    stubResizeObserver();
    stubColumnWidths({ width: 165 });
    stubRegionWidth({ width: 328 });
    render(framed());
    expect(firstColOf(region())).toBe("loose");
    expect(region().style.getPropertyValue(FIRST_COLUMN)).toBe("");
  });

  it("US-QS-15 · 2.4.11 at 200 % text on a phone (243 px of 329) the first column is loose", () => {
    stubResizeObserver();
    stubColumnWidths({ width: 243 });
    stubRegionWidth({ width: 329 });
    render(framed());
    expect(firstColOf(region())).toBe("loose");
  });

  it("US-QS-15 · 2.4.11 the region judges again when it changes its own size, and the column sticks again in a wider region", () => {
    const seen = stubResizeObserver();
    stubColumnWidths({ width: 150 });
    const box = { width: 400 };
    stubRegionWidth(box);
    render(framed());
    expect(firstColOf(region())).toBe("sticky");
    box.width = 290;
    act(() => seen.forEach((entry) => entry.run()));
    expect(firstColOf(region())).toBe("loose");
    expect(region().style.getPropertyValue(FIRST_COLUMN)).toBe("");
    box.width = 400;
    act(() => seen.forEach((entry) => entry.run()));
    expect(firstColOf(region())).toBe("sticky");
    expect(region().style.getPropertyValue(FIRST_COLUMN)).toBe("150px");
  });

  it("US-QS-15 · 2.4.11 the region judges again when the text grows and the first column with it, and back when it shrinks", () => {
    const seen = stubResizeObserver();
    const first = { width: 100 };
    stubColumnWidths(first);
    stubRegionWidth({ width: 329 });
    render(framed());
    expect(firstColOf(region())).toBe("sticky");
    first.width = 243;
    act(() => seen.forEach((entry) => entry.run()));
    expect(firstColOf(region())).toBe("loose");
    first.width = 100;
    act(() => seen.forEach((entry) => entry.run()));
    expect(firstColOf(region())).toBe("sticky");
  });

  it("US-QS-15 · 2.4.11 the judgement does not flip back and forth: the same sizes give the same result on every run", () => {
    // A cell that stops sticking keeps its width (only its place changes), so the width the judgement reads is the same in
    // both states, and a run after a run changes nothing.
    const seen = stubResizeObserver();
    stubColumnWidths({ width: 243 });
    stubRegionWidth({ width: 329 });
    render(framed());
    for (let run = 0; run < 5; run++) {
      act(() => seen.forEach((entry) => entry.run()));
      expect(firstColOf(region())).toBe("loose");
      expect(region().style.getPropertyValue(FIRST_COLUMN)).toBe("");
    }
  });

  it("US-QS-15 · 2.4.11 a region without a width (jsdom, hidden) does not make the column loose", () => {
    stubResizeObserver();
    stubColumnWidths({ width: 243 });
    render(framed());
    expect(firstColOf(region())).toBe("sticky");
    expect(region().style.getPropertyValue(FIRST_COLUMN)).toBe("243px");
  });

  it("US-QS-15 · 2.4.11 a table that is hidden (no width) has neither the attribute nor the variable, and gets both when it shows", () => {
    const seen = stubResizeObserver();
    const first = { width: 0 };
    stubColumnWidths(first);
    stubRegionWidth({ width: 328 });
    render(framed());
    expect(firstColOf(region())).toBeNull();
    first.width = 100;
    act(() => seen.forEach((entry) => entry.run()));
    expect(firstColOf(region())).toBe("sticky");
    first.width = 0;
    act(() => seen.forEach((entry) => entry.run()));
    expect(firstColOf(region())).toBeNull();
    expect(region().style.getPropertyValue(FIRST_COLUMN)).toBe("");
  });

  it("US-QS-15 · 2.4.11 a browser without a ResizeObserver judges once and sets the attribute", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    stubColumnWidths({ width: 243 });
    stubRegionWidth({ width: 329 });
    render(framed());
    expect(firstColOf(region())).toBe("loose");
  });

  it("US-QS-15 · 2.4.11 the first cells stop sticking to the left when the first column is loose, the header row keeps its top", () => {
    render(framed());
    const cells = [
      screen.getByRole("columnheader", { name: "Name" }),
      screen.getByRole("rowheader", { name: "Monstera" }),
      screen.getByRole("cell", { name: "Efeutute" }),
    ];
    for (const cell of cells) {
      expect(classesOf(cell)).toContain("group-data-[first-col=loose]/table:first:left-auto");
      // Opaque and layered as before: only the `left` goes.
      expect(classesOf(cell).some((c) => /^(first:)?bg-card$/.test(c))).toBe(true);
    }
    expect(classesOf(region())).toContain("group/table");
    for (const head of screen.getAllByRole("columnheader")) {
      expect(classesOf(head)).toContain("sticky");
      expect(classesOf(head)).toContain("top-0");
    }
  });

  it("US-QS-15 · 2.4.11 the region keeps 8 px of scroll padding on the right, more than a focus ring and its offset need", () => {
    render(framed());
    // `ring-2` and `ring-offset-2` reach 4 px beyond a control; `scroll-pr-2` is 2 spacing steps (8 px at 100 % text).
    expect(classesOf(region())).toContain("scroll-pr-2");
  });

  it("US-QS-15 · DS-36 the caller's `scroll-pr-4` replaces the right padding (the class merge knows the group)", () => {
    stubResizeObserver();
    render(<Table containerClassName="scroll-pr-4" />);
    expect(classesOf(region())).toContain("scroll-pr-4");
    expect(classesOf(region())).not.toContain("scroll-pr-2");
  });
});

/** The room of the region and the boxes of the controls in it, in px across (one line of cells is enough). */
type Room = { left: number; width: number; ring: number; column: number };

/**
 * Layout for the handler of the focus: the region is `room.width` px wide from `room.left`, keeps `room.column` px on the left
 * (the variable of the sticky first column) and `room.ring` px on the right as scroll padding; `scrolled.by` is how far it is
 * scrolled sideways; a control stands at `at` px in the content, `width` px wide, and moves with the scroll.
 */
function stubFocusLayout(
  room: Room,
  scrolled: { by: number },
  boxes: Map<Element, [number, number]>,
) {
  // The scroll padding the classes of the region give in a browser (jsdom knows no such property).
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => {
    const style = real(element, pseudo);
    if (element.hasAttribute("data-scroll-region")) {
      const left = room.column > 0 ? `${room.column}px` : "auto";
      Object.defineProperties(style, {
        scrollPaddingLeft: { value: left, configurable: true },
        scrollPaddingRight: { value: `${room.ring}px`, configurable: true },
      });
    }
    return style;
  });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.hasAttribute("data-scroll-region") ? room.width : 0;
  });
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    if (this.hasAttribute("data-scroll-region"))
      return { left: room.left, right: room.left + room.width } as DOMRect;
    const box = boxes.get(this);
    if (!box) return { left: 0, right: 0, width: 0 } as DOMRect;
    const left = room.left + box[0] - scrolled.by;
    return { left, right: left + box[1], width: box[1] } as DOMRect;
  });
}

describe("Table brings a control that gets the focus from the keyboard into the free room (US-QS-15, WCAG 2.4.11, issue 2601)", () => {
  const region = () => screen.getByRole("region", { name: "Tabelle" });

  /** A table with a control in the third cell of a row, a control in the first cell and one in the corner. */
  function withControls() {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <button type="button">Kopf</button>
            </TableHead>
            <TableHead>Standort</TableHead>
            <TableHead>Raum</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableHead scope="row">
              <button type="button">Spalte</button>
            </TableHead>
            <TableCell>Fenster</TableCell>
            <TableCell>
              <button type="button">Wohnzimmer</button>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
  }

  /** Sets up the layout and the scroll of the region; the region scrolls through `scrolled.by`. */
  function setup(
    room: Room,
    at: [number, number],
    scrolled = { by: 0 },
    column: [number, number] = [0, 90],
  ) {
    stubResizeObserver();
    render(withControls());
    const control = screen.getByRole("button", { name: "Wohnzimmer" });
    const boxes = new Map<Element, [number, number]>([
      [control, at],
      [screen.getByRole("button", { name: "Spalte" }), column],
      [screen.getByRole("button", { name: "Kopf" }), [0, 90]],
    ]);
    stubFocusLayout(room, scrolled, boxes);
    Object.defineProperty(region(), "scrollLeft", {
      configurable: true,
      get: () => scrolled.by,
      set: (to: number) => {
        scrolled.by = Math.max(0, to);
      },
    });
    return { control, scrolled };
  }

  const room = { left: 16, width: 328, ring: 8, column: 120 };

  it("US-QS-15 · 2.4.11 a control that is partly under the first column is scrolled to the room beside it, with room for its ring", () => {
    // The control stands at 260 to 360 in the content; scrolled by 300 it is at -24 to 76 on the screen: 40 px of it show
    // right of the column (which ends at 16 + 120 = 136), and Chromium would leave it there.
    const { control, scrolled } = setup(room, [320, 100], { by: 300 });
    act(() => control.focus());
    // It starts 8 px right of the column (the room of the ring): at 144 on the screen, content 320 - scroll = 128.
    expect(16 + 320 - scrolled.by).toBe(144);
  });

  it("US-QS-15 · 2.4.11 a control that is partly outside the right edge is scrolled in, up to the room of its ring", () => {
    // Content 246 to 359 (113 px wide), not scrolled: the region ends at 344, so 15 px of the control are outside.
    const { control, scrolled } = setup(room, [230, 113]);
    act(() => control.focus());
    // Its right edge ends 8 px before the right edge of the region: 344 - 8 = 336.
    expect(16 + 230 + 113 - scrolled.by).toBe(336);
  });

  it("US-QS-15 · 2.4.11 a control that fits in the free room is left where it is", () => {
    const { control, scrolled } = setup(room, [200, 100], { by: 50 });
    act(() => control.focus());
    expect(scrolled.by).toBe(50);
  });

  it("US-QS-15 · 2.4.11 a control wider than the free room is aligned to the left of the room, so that its start shows", () => {
    const { control, scrolled } = setup({ ...room, column: 200 }, [260, 216], { by: 100 });
    act(() => control.focus());
    // Left edge at the column (16 + 200) plus the ring room.
    expect(16 + 260 - scrolled.by).toBe(224);
  });

  it("US-QS-15 · 2.4.11 while the first column is loose the room starts at the left edge of the region, with the room of the ring", () => {
    const { control, scrolled } = setup({ ...room, column: 0 }, [330, 216], { by: 400 });
    act(() => control.focus());
    // Content 330 - 400 = -70, so the control is 70 px outside the left edge: left edge at 16 + 8.
    expect(16 + 330 - scrolled.by).toBe(24);
  });

  it("US-QS-15 · 2.4.11 a control that gets the focus from the pointer is left where it is, so the click is not lost", () => {
    const { control, scrolled } = setup(room, [230, 113]);
    const matches = Element.prototype.matches;
    vi.spyOn(Element.prototype, "matches").mockImplementation(function (this: Element, query) {
      return query === ":focus-visible" ? false : matches.call(this, query);
    });
    act(() => control.focus());
    expect(scrolled.by).toBe(0);
  });

  it("US-QS-15 · 2.4.11 a control in the sticky first column or the corner is always in view and does not scroll the region", () => {
    const { scrolled } = setup(room, [230, 113], { by: 200 });
    // Within the sticky column the box is at its place on the screen whatever the scroll; the stub puts it at 0 (+ scroll).
    act(() => screen.getByRole("button", { name: "Spalte" }).focus());
    act(() => screen.getByRole("button", { name: "Kopf" }).focus());
    expect(scrolled.by).toBe(200);
  });

  it("US-QS-15 · 2.4.11 a control in a loose first column scrolls into the room like any other", () => {
    const { scrolled } = setup({ ...room, column: 0 }, [230, 113], { by: 200 }, [60, 90]);
    region().setAttribute("data-first-col", "loose");
    act(() => screen.getByRole("button", { name: "Spalte" }).focus());
    // Content 60 - 200 = -140: scrolled back until the control stands at the left edge plus the ring room (16 + 8).
    expect(16 + 60 - scrolled.by).toBe(24);
  });

  it("US-QS-15 · 2.4.11 the region itself, a tab stop of its own, has no control to bring in", () => {
    const { scrolled } = setup(room, [230, 113], { by: 123 });
    act(() => region().focus());
    expect(scrolled.by).toBe(123);
  });
});

function sample(ref?: React.Ref<HTMLTableElement>) {
  return (
    <Table ref={ref}>
      <TableCaption>Pflanzen</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Standort</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>Monstera</TableCell>
          <TableCell>Fenster</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

describe("Table (US-QS-07, DS-24, DS-36)", () => {
  it("US-QS-07 · DS-24 is a semantic table with caption, column headers and cells", () => {
    render(sample());
    expect(screen.getByRole("table", { name: "Pflanzen" })).toBeTruthy();
    const headers = screen.getAllByRole("columnheader");
    expect(headers.map((h) => h.textContent)).toEqual(["Name", "Standort"]);
    expect(headers[0]?.getAttribute("scope")).toBe("col");
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(screen.getByRole("cell", { name: "Monstera" })).toBeTruthy();
  });

  it("US-QS-07 · DS-24 only the table scrolls, inside its own container and in both directions (US-QS-15)", () => {
    render(sample());
    const table = screen.getByRole("table");
    const wrapper = table.parentElement as HTMLElement;
    expect(classesOf(wrapper)).toContain("overflow-auto");
    expect(table.className).not.toContain("overflow");
  });

  it("US-QS-07 · DS-37 the scroll region is a focusable, named region with a visible focus ring", () => {
    render(sample());
    const region = screen.getByRole("region", { name: "Tabelle" });
    expect(region).toBe(screen.getByRole("table").parentElement);
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(region.className).toContain("focus-visible:ring-2");
    expect(region.className).toContain("focus-visible:ring-ring");
  });

  it("US-QS-07 · DS-37 the caller names the region via containerLabel", () => {
    render(
      <Table containerLabel="Pflanzenvergleich">
        <TableBody>
          <TableRow>
            <TableCell>x</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(screen.getByRole("region", { name: "Pflanzenvergleich" })).toBeTruthy();
  });

  it("US-QS-07 · DS-36 forwards ref and puts caller classes last", () => {
    const ref = createRef<HTMLTableElement>();
    render(
      <Table ref={ref} className="hidden md:table" data-testid="t">
        <TableBody>
          <TableRow>
            <TableCell className="px-9">x</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(screen.getByTestId("t")).toBe(ref.current);
    expect(ref.current?.className).toContain("md:table");
    expect(screen.getByText("x").className).toContain("px-9");
  });
});
