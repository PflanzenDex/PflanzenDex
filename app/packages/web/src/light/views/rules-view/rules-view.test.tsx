// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { LayerScope } from "@/shared/ui/layer-scope";
import { RulesView } from "./rules-view";
import type { LightZone } from "../../shared/light-api/light-api";

beforeEach(() => setViewportWidth(1024));
afterEach(() => cleanup());

const zones: LightZone[] = [
  { id: "z2", name: "Fensterbank", luxCeiling: 15000, ppfd: 300, sortOrder: 2 },
  { id: "z1", name: "Zone 1 · Stecklingslicht", luxCeiling: 1500, ppfd: null, sortOrder: 1 },
];

describe("US-LIC-04 look up the classification rules (view)", () => {
  it("US-QS-32 each zone is one row, sorted: its name once and its reach in lux and PPFD, unknown PPFD as 'PPFD unbekannt'", () => {
    render(
      <MemoryRouter>
        <RulesView zones={zones} />
      </MemoryRouter>,
    );
    // The zone rows are the items of the group "Deine Lichtzonen".
    const rows = within(screen.getByRole("region", { name: "Deine Lichtzonen" })).getAllByRole(
      "listitem",
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toMatch(/^Zone 1 · Stecklingslicht/);
    expect(rows[0]?.textContent).toMatch(/bis 1\.500\s+Lux/);
    expect(rows[0]?.textContent).toContain("PPFD unbekannt");
    expect(rows[1]?.textContent).toMatch(/^Fensterbank/);
    expect(rows[1]?.textContent).toMatch(/bis 15\.000\s+Lux · PPFD 300\s+µmol\/m²\/s/);
    expect(document.body.textContent).not.toContain("Zone Zone");
    expect(screen.queryByRole("row")).toBeNull();
  });

  it("US-QS-15 · SG-LIST-01 on a page the parts stand on one scrolling list, from the zone table to the warning signs, with no pages", () => {
    render(
      <MemoryRouter>
        <RulesView zones={zones} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("button", { name: /^(Zurück|Weiter)$/ })).toBeNull();
    expect(screen.queryByText(/^Seite \d+ von \d+$/)).toBeNull();
    expect(screen.getByRole("heading", { name: "Indikatoren für höhere Zonen" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Warnzeichen" })).toBeTruthy();
  });

  it("US-QS-19 · US-QS-15 in a layer the parts stand on one scrolling list: the indicators and the warning signs need no Weiter (issue 2418)", () => {
    render(
      <MemoryRouter>
        <LayerScope.Provider value>
          <RulesView zones={zones} />
        </LayerScope.Provider>
      </MemoryRouter>,
    );
    expect(screen.queryByText(/^Seite \d+ von \d+$/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Weiter" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Indikatoren für höhere Zonen" })).toBeTruthy();
    expect(screen.getByText(/CAM-Stoffwechsel/)).toBeTruthy();
    expect(screen.getByText(/Dornen/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Warnzeichen" })).toBeTruthy();
    expect(screen.getByText(/Vergeilung/)).toBeTruthy();
    expect(screen.getAllByText(/Prüfe/).length).toBeGreaterThan(0);
  });

  it("without zones it still shows the reference and says what to do next (P-09)", () => {
    render(
      <MemoryRouter>
        <LayerScope.Provider value>
          <RulesView zones={[]} />
        </LayerScope.Provider>
      </MemoryRouter>,
    );
    expect(screen.getByText(/Zonentabelle erscheint/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Warnzeichen" })).toBeTruthy();
  });
});
