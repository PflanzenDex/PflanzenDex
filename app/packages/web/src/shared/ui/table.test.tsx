// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";

afterEach(cleanup);

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
