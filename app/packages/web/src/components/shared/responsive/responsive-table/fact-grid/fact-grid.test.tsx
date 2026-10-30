// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button/button";
import { FactGrid, missingText, unknownInEvery } from "./fact-grid";

afterEach(cleanup);

const facts = [
  { label: "Lichtzone", value: "Zone 2" },
  { label: "Substrat", value: null },
  { label: "Schwierigkeit", value: "Leicht" },
  { label: "Schnitt", value: null },
];

describe("US-QS-24 FactGrid", () => {
  it("US-QS-24 renders the known facts as label and value pairs and prints no unknown value", () => {
    const { container } = render(<FactGrid facts={facts} />);
    const dl = container.querySelector("dl") as HTMLElement;
    const pairs = [...dl.querySelectorAll("dt")].map((dt) => [
      dt.textContent,
      dt.nextElementSibling?.textContent,
    ]);
    expect(pairs).toEqual([
      ["Lichtzone", "Zone 2"],
      ["Schwierigkeit", "Leicht"],
    ]);
    expect(screen.queryByText("unbekannt")).toBeNull();
  });

  it("US-QS-24 folds the unknown facts into one line with the count and the German plural", () => {
    render(<FactGrid facts={facts} />);
    expect(screen.getByText("2 Angaben fehlen")).toBeTruthy();
    expect(screen.getAllByText("2 Angaben fehlen")).toHaveLength(1);
  });

  it("US-QS-24 uses the singular for one missing fact", () => {
    render(
      <FactGrid
        facts={[
          { label: "Lichtzone", value: "Zone 2" },
          { label: "Schnitt", value: null },
        ]}
      />,
    );
    expect(screen.getByText("1 Angabe fehlt")).toBeTruthy();
    expect(missingText(12)).toBe("12 Angaben fehlen");
  });

  it("US-QS-24 the names of the missing facts open behind the count", () => {
    render(<FactGrid facts={facts} />);
    const summary = screen.getByText("2 Angaben fehlen");
    expect(summary.closest("details")?.querySelector("p")?.textContent).toBe("Substrat, Schnitt");
  });

  it("US-QS-24 the next step is the action of the caller and it fires", async () => {
    const onNext = vi.fn();
    render(
      <FactGrid
        facts={facts}
        next={
          <Button type="button" variant="outline" onClick={onNext}>
            Ergänzen
          </Button>
        }
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Ergänzen" }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("US-QS-24 without a next step a neutral sentence says what to do (P-09)", () => {
    render(<FactGrid facts={facts} />);
    expect(screen.getByText("Ergänzen, sobald du die Angaben kennst.")).toBeTruthy();
  });

  it("US-QS-24 without an unknown fact there is no fold line", () => {
    render(<FactGrid facts={[{ label: "Lichtzone", value: "Zone 2" }]} />);
    expect(screen.queryByText(/fehlt|fehlen/)).toBeNull();
    expect(screen.queryByText("Ergänzen, sobald du die Angaben kennst.")).toBeNull();
  });

  it("US-QS-24 with only unknown facts the grid is empty and the fold stays", () => {
    const { container } = render(<FactGrid facts={[{ label: "Schnitt", value: null }]} />);
    expect(container.querySelector("dl")).toBeNull();
    expect(within(container).getByText("1 Angabe fehlt")).toBeTruthy();
  });
});

describe("US-QS-24 unknownInEvery hides a column that is unknown for every row", () => {
  type Row = { name: string; substrate: string | null; zone: string | null };
  const rows: Row[] = [
    { name: "A", substrate: null, zone: "Zone 1" },
    { name: "B", substrate: null, zone: null },
  ];
  const factsOfRow = (r: Row) => [
    { label: "Substrat", value: r.substrate },
    { label: "Lichtzone", value: r.zone },
  ];

  it("US-QS-24 names the labels that no row knows and keeps the others", () => {
    expect(unknownInEvery(rows, factsOfRow)).toEqual(["Substrat"]);
  });

  it("US-QS-24 with one known value in any row the column stays", () => {
    const more = [...rows, { name: "C", substrate: "Humus", zone: null }];
    expect(unknownInEvery(more, factsOfRow)).toEqual([]);
  });

  it("US-QS-24 without rows nothing is hidden", () => {
    expect(unknownInEvery([] as Row[], factsOfRow)).toEqual([]);
  });
});
