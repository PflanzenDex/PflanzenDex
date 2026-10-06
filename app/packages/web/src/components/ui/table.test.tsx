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

  it("US-QS-07 · DS-24 only the table scrolls horizontally, inside its own container", () => {
    render(sample());
    const table = screen.getByRole("table");
    const wrapper = table.parentElement as HTMLElement;
    expect(wrapper.className).toContain("overflow-x-auto");
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
