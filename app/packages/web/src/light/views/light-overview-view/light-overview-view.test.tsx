// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/lib/viewport-mock";
import { LightOverviewView } from "./light-overview-view";
import type { LightOverview, LightOverviewRow } from "../../shared/light-api/light-api";

beforeEach(() => setViewportWidth(1024));
afterEach(() => {
  cleanup();
});

const zone2 = { id: "z2", name: "Zone 2", luxCeiling: 15000, ppfd: 300, sortOrder: 1 };
const zone3 = { id: "z3", name: "Zone 3", luxCeiling: 100000, ppfd: 1600, sortOrder: 2 };
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
  render(
    <MemoryRouter>
      <LightOverviewView data={data} onOpenCollection={noop} />
    </MemoryRouter>,
  );
};

describe("US-LIC-03: light overview view", () => {
  it("shows the next step in the empty state and the button opens the collection (P-09)", async () => {
    const open = vi.fn();
    render(
      <MemoryRouter>
        <LightOverviewView data={{ rows: [] }} onOpenCollection={open} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/noch keine arten/i)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Zur Sammlung" }));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("US-LIC-03 · issue 1155 shows plant, zone, lux demand (de-DE) and position on one row", () => {
    show([row()]);
    const item = screen.getAllByRole("listitem")[0] as HTMLElement;
    expect(item.textContent).toContain("Monstera deliciosa");
    expect(item.textContent).toContain("Zone 2 · Lux-Bedarf 15.000");
    expect(item.textContent).toContain("sehr nah (~10 cm)");
  });

  it('US-LIC-01 P-08: an unknown lux need shows "unbekannt" and the next step once, never 0 or a position (#1003, issue 1155)', () => {
    show([
      row({ lightDemandLux: null, position: null, zone: null }),
      row({ speciesId: "sp2", speciesName: "Pilea", lightDemandLux: null, position: null }),
    ]);
    const items = screen.getAllByRole("listitem");
    expect(items[0]?.textContent).toContain("Lichtzone unbekannt · Lux-Bedarf unbekannt");
    expect(items[0]?.textContent).not.toMatch(/\b0\b/);
    expect(screen.getAllByText(/Lichtbedarf eintragen/)).toHaveLength(1);
    for (const item of items) expect(item.textContent).not.toContain("Lichtbedarf eintragen");
  });

  it("formats five-digit demands with the German thousands separator", () => {
    show([row({ lightDemandLux: 50000 }), row({ speciesId: "sp2", lightDemandLux: 110000 })]);
    expect(screen.getByText(/Lux-Bedarf 50\.000/)).toBeTruthy();
    expect(screen.getByText(/Lux-Bedarf 110\.000/)).toBeTruthy();
  });

  it("renders the rows in the order delivered (sorting is done by core, US-LIC-03 core and API tests)", () => {
    show([
      row({ speciesId: "a", speciesName: "Erste", lightDemandLux: 100000, zone: zone3 }),
      row({ speciesId: "b", speciesName: "Zweite", lightDemandLux: 2000 }),
    ]);
    const names = screen.getAllByRole("listitem").map((r) => r.textContent);
    expect(names[0]).toContain("Erste");
    expect(names[1]).toContain("Zweite");
  });

  it("US-LIC-03 · US-QS-15 · issue 1155 the species are rows paged by the free height of the layer, not a table", () => {
    show([row()]);
    expect(screen.queryByRole("table")).toBeNull();
    const list = screen.getByRole("list", { name: "Lichthunger der Arten" });
    expect(list.hasAttribute("data-page-fit")).toBe(true);
  });
});
