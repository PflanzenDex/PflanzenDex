// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/lib/viewport-mock";
import { LightOverviewView } from "./light-overview-view";
import type { LightOverview, LightOverviewRow } from "./light-api";

beforeEach(() => setViewportWidth(1024));
afterEach(() => {
  cleanup();
});

const zone2 = { id: "z2", name: "Lampe 2", luxCeiling: 15000, ppfd: 300, sortOrder: 1 };
const zone3 = { id: "z3", name: "Lampe 3", luxCeiling: 100000, ppfd: 1600, sortOrder: 2 };
const row = (extra: Partial<LightOverviewRow> = {}): LightOverviewRow => ({
  speciesId: "sp1",
  speciesName: "Monstera deliciosa",
  lightDemandLux: 15000,
  position: { category: "very_close", description: "sehr nah (~10 cm)" },
  zone: zone2,
  ...extra,
});
const noop = () => undefined;
const show = (rows: LightOverviewRow[]) => {
  const data: LightOverview = { rows };
  render(<LightOverviewView data={data} onOpenCollection={noop} />);
};

describe("US-LIC-03: light overview view", () => {
  it("shows the next step in the empty state and the button opens the collection (P-09)", async () => {
    const open = vi.fn();
    render(<LightOverviewView data={{ rows: [] }} onOpenCollection={open} />);
    expect(screen.getByText(/noch keine arten/i)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Zum Bestand" }));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("displays plant, zone, lux demand (de-DE) and position", () => {
    show([row()]);
    const cells = within(screen.getAllByRole("row")[1] as HTMLElement)
      .getAllByRole("cell")
      .map((c) => c.textContent);
    expect(cells).toEqual(["Monstera deliciosa", "Lampe 2", "15.000", "sehr nah (~10 cm)"]);
  });

  it("formats five-digit demands with the German thousands separator", () => {
    show([row({ lightDemandLux: 50000 }), row({ speciesId: "sp2", lightDemandLux: 110000 })]);
    expect(screen.getByText("50.000")).toBeTruthy();
    expect(screen.getByText("110.000")).toBeTruthy();
  });

  it('shows "unbekannt" when the zone of a species is unknown (P-08)', () => {
    show([row({ zone: null })]);
    expect(screen.getByRole("cell", { name: "unbekannt" })).toBeTruthy();
  });

  it("renders the rows in the order delivered (sorting is done by core, US-LIC-03 core and API tests)", () => {
    show([
      row({ speciesId: "a", speciesName: "Erste", lightDemandLux: 100000, zone: zone3 }),
      row({ speciesId: "b", speciesName: "Zweite", lightDemandLux: 2000 }),
    ]);
    const names = screen
      .getAllByRole("row")
      .slice(1)
      .map((r) => r.textContent);
    expect(names[0]).toContain("Erste");
    expect(names[1]).toContain("Zweite");
  });
});

describe("US-LIC-03 · DS-48 light overview on a phone", () => {
  it("shows each species as a card with labelled values instead of a table", () => {
    setViewportWidth(360);
    show([row()]);
    expect(screen.queryByRole("table")).toBeNull();
    const list = screen.getByRole("list", { name: "Lichthunger der Arten" });
    expect(within(list).getByText("Lux-Bedarf")).toBeTruthy();
    expect(within(list).getByText("15.000")).toBeTruthy();
  });
});
