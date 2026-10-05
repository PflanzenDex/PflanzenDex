// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { setViewportWidth } from "@/lib/viewport-mock";
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
