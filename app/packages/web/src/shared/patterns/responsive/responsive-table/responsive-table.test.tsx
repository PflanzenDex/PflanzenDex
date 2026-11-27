// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { ResponsiveTable, type ResponsiveColumn } from "./responsive-table";

afterEach(cleanup);

type Row = { id: string; name: string; spot: string };
const rows: Row[] = [
  { id: "1", name: "Monstera", spot: "Fenster" },
  { id: "2", name: "Efeutute", spot: "Regal" },
];
const columns: ResponsiveColumn<Row>[] = [
  { key: "name", header: "Name", cell: (r) => r.name },
  { key: "spot", header: "Standort", cell: (r) => r.spot },
];
const rowAction = {
  label: "Details",
  render: (r: Row) => <a href={`/bestand/${r.id}`}>{r.name} öffnen</a>,
};

function Example() {
  return (
    <ResponsiveTable
      caption="Meine Pflanzen"
      columns={columns}
      rows={rows}
      getRowKey={(r) => r.id}
      rowAction={rowAction}
    />
  );
}

describe("ResponsiveTable (US-QS-07, DS-24)", () => {
  it("US-QS-07 · DS-24 below md each row is a card with label/value pairs and its main action", () => {
    setViewportWidth(360);
    render(<Example />);
    expect(screen.queryByRole("table")).toBeNull();
    const cards = screen.getAllByRole("listitem");
    expect(cards).toHaveLength(2);
    const first = within(cards[0] as HTMLElement);
    expect(first.getByText("Standort")).toBeTruthy();
    expect(first.getByText("Fenster")).toBeTruthy();
    expect(first.getByRole("link", { name: "Monstera öffnen" })).toBeTruthy();
  });

  it("US-QS-07 · DS-24 from md the same data shows in the Table with the same columns", () => {
    setViewportWidth(768);
    render(<Example />);
    expect(screen.queryByRole("listitem")).toBeNull();
    const table = screen.getByRole("table", { name: "Meine Pflanzen" });
    const headers = within(table).getAllByRole("columnheader");
    expect(headers.map((h) => h.textContent)).toEqual(["Name", "Standort", "Details"]);
    expect(within(table).getByText("Efeutute")).toBeTruthy();
    expect(within(table).getByRole("link", { name: "Efeutute öffnen" })).toBeTruthy();
  });

  it("US-QS-07 · DS-24 the card stack never forces horizontal scroll", () => {
    setViewportWidth(320);
    render(<Example />);
    expect(screen.getByRole("list").className).toContain("min-w-0");
    expect((screen.getAllByRole("listitem")[0] as HTMLElement).className).toContain("break-words");
  });
});

describe("ResponsiveTable keeps header row and first column (US-QS-15, DS-58, SG-LIST-01, issue 2420)", () => {
  it("US-QS-15 · SG-LIST-01 from md the first column of every row is its row header, the other columns are cells", () => {
    setViewportWidth(768);
    render(<Example />);
    const table = screen.getByRole("table", { name: "Meine Pflanzen" });
    const rowHeaders = within(table).getAllByRole("rowheader");
    expect(rowHeaders.map((h) => h.textContent)).toEqual(["Monstera", "Efeutute"]);
    for (const head of rowHeaders) expect(head.getAttribute("scope")).toBe("row");
    // The column headers stay `scope="col"`; the other cells of a row are plain cells.
    for (const head of within(table).getAllByRole("columnheader"))
      expect(head.getAttribute("scope")).toBe("col");
    const rows = within(table).getAllByRole("row").slice(1);
    for (const row of rows) {
      expect(within(row).getAllByRole("rowheader")).toHaveLength(1);
      expect(within(row).getAllByRole("cell")).toHaveLength(2);
    }
    expect(within(rows[0] as HTMLElement).getByRole("cell", { name: "Fenster" })).toBeTruthy();
  });

  it("US-QS-15 · DS-58 from md the table is the marked scroll region of its frame, header row and first column stick", () => {
    setViewportWidth(1024);
    render(<Example />);
    const region = screen.getByRole("region", { name: "Meine Pflanzen" });
    expect(region.hasAttribute("data-scroll-region")).toBe(true);
    expect(region.getAttribute("data-scroll-x")).toBe("table");
    const rowHeader = within(region).getAllByRole("rowheader")[0] as HTMLElement;
    expect(rowHeader.className.split(/\s+/)).toContain("first:sticky");
    for (const head of within(region).getAllByRole("columnheader"))
      expect(head.className.split(/\s+/)).toContain("sticky");
  });

  it("US-QS-15 · DS-24 a row action stays the last column and keeps its link", () => {
    setViewportWidth(768);
    render(<Example />);
    const table = screen.getByRole("table", { name: "Meine Pflanzen" });
    const first = within(table).getAllByRole("row")[1] as HTMLElement;
    const last = first.lastElementChild as HTMLElement;
    expect(within(last).getByRole("link", { name: "Monstera öffnen" })).toBeTruthy();
    expect(last.tagName).toBe("TD");
  });

  it("US-QS-15 · DS-24 without a data column the row action is no row header", () => {
    setViewportWidth(768);
    render(
      <ResponsiveTable
        caption="Aktionen"
        columns={[]}
        rows={rows}
        getRowKey={(r) => r.id}
        rowAction={rowAction}
      />,
    );
    const table = screen.getByRole("table", { name: "Aktionen" });
    expect(within(table).queryAllByRole("rowheader")).toHaveLength(0);
    expect(within(table).getAllByRole("link")).toHaveLength(2);
  });
});
