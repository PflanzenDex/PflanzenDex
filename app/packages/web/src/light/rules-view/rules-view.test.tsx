// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setViewportWidth } from "@/lib/viewport-mock";
import { RulesView } from "./rules-view";
import type { LightZone } from "../light-api";

beforeEach(() => setViewportWidth(1024));
afterEach(() => cleanup());

const zones: LightZone[] = [
  { id: "z2", name: "Fensterbank", luxCeiling: 15000, ppfd: 300, sortOrder: 2 },
  { id: "z1", name: "Lampe 1", luxCeiling: 1500, ppfd: null, sortOrder: 1 },
];

describe("US-LIC-04 look up the classification rules (view)", () => {
  it("shows the keeper's own zones sorted, with lux ceiling (de-DE) and unknown PPFD as 'unbekannt'", () => {
    render(<RulesView zones={zones} />);
    const rows = screen.getAllByRole("row").slice(1);
    const cells = rows.map((r) =>
      within(r)
        .getAllByRole("cell")
        .map((c) => c.textContent),
    );
    expect(cells).toEqual([
      ["Lampe 1", "1.500", "unbekannt"],
      ["Fensterbank", "15.000", "300"],
    ]);
  });

  it("lists the indicators for higher levels and the warning signs with their next step", () => {
    render(<RulesView zones={zones} />);
    expect(screen.getByRole("heading", { name: "Indikatoren für höhere Stufen" })).toBeTruthy();
    expect(screen.getByText(/CAM-Stoffwechsel/)).toBeTruthy();
    expect(screen.getByText(/Dornen/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Warnzeichen" })).toBeTruthy();
    expect(screen.getByText(/Vergeilung/)).toBeTruthy();
    expect(screen.getAllByText(/Prüfe/).length).toBeGreaterThan(0);
  });

  it("without zones it still shows the reference and says what to do next (P-09)", () => {
    render(<RulesView zones={[]} />);
    expect(screen.getByText(/Stufentabelle erscheint/)).toBeTruthy();
    expect(screen.getByText(/Warnzeichen/)).toBeTruthy();
  });
});
