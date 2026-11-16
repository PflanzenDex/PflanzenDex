// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
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
  lightNeedUnknown: false,
  ...extra,
});
const show = (rows: LightOverviewRow[]) => {
  const data: LightOverview = { rows };
  render(
    <MemoryRouter>
      <LightOverviewView data={data} />
    </MemoryRouter>,
  );
};

describe("US-LIC-03: light overview view", () => {
  it("US-QS-32 shows one line and the next step in the empty state: Pflanze anlegen links to the add-plant form (P-09)", () => {
    render(
      <MemoryRouter>
        <LightOverviewView data={{ rows: [] }} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Noch keine Art: lege zuerst eine Pflanze an.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Pflanze anlegen" }).getAttribute("href")).toBe(
      "/collection/new",
    );
  });

  it("US-LIC-03 · issue 1155 shows plant, zone, lux demand (de-DE) and position on one row", () => {
    show([row()]);
    const item = screen.getAllByRole("listitem")[0] as HTMLElement;
    expect(item.textContent).toContain("Monstera deliciosa");
    expect(item.textContent).toContain("Zone 2 · Lichtbedarf 15.000");
    expect(item.textContent).toContain("sehr nah (~10 cm)");
  });

  it('US-LIC-01 P-08 P-09: an unknown lux need shows "unbekannt" and the next step on its own row, never 0 or a position (#1003, issue 1155)', () => {
    show([
      row({ lightDemandLux: null, position: null, zone: null, lightNeedUnknown: true }),
      row({
        speciesId: "sp2",
        speciesName: "Pilea",
        lightDemandLux: null,
        position: null,
        zone: null,
        lightNeedUnknown: false,
      }),
    ]);
    const items = screen.getAllByRole("listitem");
    expect(items[0]?.textContent).toContain("Lichtzone unbekannt · Lichtbedarf unbekannt");
    expect(items[0]?.textContent).not.toMatch(/\b0\b/);
    const link = within(items[0] as HTMLElement).getByRole("link", {
      name: "Lichtbedarf eintragen für „Monstera deliciosa“",
    });
    expect(link.getAttribute("href")).toBe("/discover/species/sp1?sheet=care");
    expect(items[1]?.textContent).not.toContain("Lichtbedarf eintragen");
  });

  it("formats five-digit demands with the German thousands separator", () => {
    show([row({ lightDemandLux: 50000 }), row({ speciesId: "sp2", lightDemandLux: 110000 })]);
    expect(screen.getByText(/Lichtbedarf 50\.000/)).toBeTruthy();
    expect(screen.getByText(/Lichtbedarf 110\.000/)).toBeTruthy();
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
    const list = screen.getByRole("list", { name: "Lichtbedarf der Arten" });
    expect(list.hasAttribute("data-page-fit")).toBe(true);
  });
});
