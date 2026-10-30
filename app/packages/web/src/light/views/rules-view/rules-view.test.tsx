// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setViewportWidth } from "@/lib/viewport-mock";
import { RulesView } from "./rules-view";
import type { LightZone } from "../../shared/light-api/light-api";

beforeEach(() => setViewportWidth(1024));
afterEach(() => cleanup());

const zones: LightZone[] = [
  { id: "z2", name: "Fensterbank", luxCeiling: 15000, ppfd: 300, sortOrder: 2 },
  { id: "z1", name: "Zone 1 · Stecklingslicht", luxCeiling: 1500, ppfd: null, sortOrder: 1 },
];

describe("US-LIC-04 look up the classification rules (view)", () => {
  it("shows the keeper's own zones sorted, with lux ceiling (de-DE) and unknown PPFD as 'unbekannt'", () => {
    render(
      <MemoryRouter>
        <RulesView zones={zones} />
      </MemoryRouter>,
    );
    const rows = screen.getAllByRole("row").slice(1);
    const cells = rows.map((r) =>
      within(r)
        .getAllByRole("cell")
        .map((c) => c.textContent),
    );
    expect(cells).toEqual([
      ["Zone 1 · Stecklingslicht", "1.500", "unbekannt"],
      ["Fensterbank", "15.000", "300"],
    ]);
  });

  it("US-QS-19 the parts come one per page: the indicators on page 2, the warning signs on page 3", async () => {
    render(
      <MemoryRouter>
        <RulesView zones={zones} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("status").textContent).toContain("Seite 1 von 3");
    expect(screen.queryByRole("heading", { name: "Indikatoren für höhere Stufen" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
    expect(screen.getByRole("heading", { name: "Indikatoren für höhere Stufen" })).toBeTruthy();
    expect(screen.getByText(/CAM-Stoffwechsel/)).toBeTruthy();
    expect(screen.getByText(/Dornen/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
    expect(screen.getByRole("heading", { name: "Warnzeichen" })).toBeTruthy();
    expect(screen.getByText(/Vergeilung/)).toBeTruthy();
    expect(screen.getAllByText(/Prüfe/).length).toBeGreaterThan(0);
  });

  it("without zones it still shows the reference and says what to do next (P-09)", async () => {
    render(
      <MemoryRouter>
        <RulesView zones={[]} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Stufentabelle erscheint/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
    expect(screen.getByText(/Warnzeichen/)).toBeTruthy();
  });
});
