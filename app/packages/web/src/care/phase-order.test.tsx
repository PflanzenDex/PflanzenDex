// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import type { LightLocation, PhasesRow } from "@pflanzendex/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CarePhasesPage } from "./CarePhasesPage";
import { PhasesList } from "./phases-list";

const locations: LightLocation[] = [
  { id: "s1", name: "Wohnzimmer", lightZoneId: null, kind: "indoor" },
  { id: "s2", name: "Kühler Flur", lightZoneId: null, kind: "indoor" },
];
const row = (
  name: string,
  locationId: string | null,
  targetLocationId: string | null,
): PhasesRow => ({
  specimenId: name,
  name,
  speciesId: "a1",
  phase: "dormancy",
  locationId,
  targetLocationId,
});
const rows = [
  row("Falsch", "s1", "s2"),
  row("Ohne Standort", null, "s2"),
  row("Am Soll", "s2", "s2"),
  row("Ohne Soll", "s1", null),
];
const section = (name: RegExp) => screen.getByRole("region", { name });
const titles = (el: HTMLElement) =>
  within(el)
    .getAllByRole("heading", { level: 3 })
    .map((h) => h.textContent);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-PHA-02 the list shows deviations first", () => {
  it("US-PHA-02 deviations form their own group above the rest and say where to move", () => {
    render(<PhasesList rows={rows} locations={locations} />);
    const deviations = section(/Weichen vom Soll ab/);
    expect(titles(deviations)).toEqual(["Falsch"]);
    expect(
      within(deviations).getByText(/steht am Standort „Wohnzimmer“, Soll ist „Kühler Flur“/),
    ).toBeTruthy();
    const all = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(all.indexOf("Weichen vom Soll ab (1)")).toBeLessThan(
      all.findIndex((t) => t?.startsWith("Stimmen überein")),
    );
  });

  it("US-PHA-02 a specimen without a location is its own warning 'Standort fehlt', no placeholder text", () => {
    render(<PhasesList rows={rows} locations={locations} />);
    const missing = section(/Standort fehlt/);
    expect(titles(missing)).toEqual(["Ohne Standort"]);
    expect(within(missing).getByText("Standort fehlt")).toBeTruthy();
    expect(within(missing).queryByText(/Standort: unbekannt/)).toBeNull();
    expect(within(missing).getByText(/unter „Hinweise“/)).toBeTruthy();
  });

  it("US-PHA-02 rows at the target or without a known target come last; an unknown target says 'unbekannt' (P-08)", () => {
    render(<PhasesList rows={rows} locations={locations} />);
    const rest = section(/Stimmen überein/);
    expect(titles(rest)).toEqual(["Am Soll", "Ohne Soll"]);
    expect(within(rest).getByText("Soll-Standort: unbekannt")).toBeTruthy();
    expect(within(rest).queryByText("Standort fehlt")).toBeNull();
  });

  it("US-PHA-02 without any deviation the page says that everything stands where it should (P-09)", () => {
    render(<PhasesList rows={[row("Am Soll", "s2", "s2")]} locations={locations} />);
    expect(screen.queryByRole("region", { name: /Weichen vom Soll ab/ })).toBeNull();
    expect(screen.getByText(/Keine Abweichung/)).toBeTruthy();
  });

  it("US-PHA-02 the page keeps the order of the server inside the groups", async () => {
    const response = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body)));
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url) =>
        new URL(String(url)).pathname === "/locations"
          ? response({ locations })
          : response({
              phases: [
                row("Zuerst", "s1", "s2"),
                row("Danach", "s1", "s2"),
                row("Zuletzt", "s2", "s2"),
              ],
            }),
      ),
    );
    render(<CarePhasesPage api="http://api" token={async () => "tok"} />);
    expect(titles(await screen.findByRole("region", { name: /Weichen vom Soll ab/ }))).toEqual([
      "Zuerst",
      "Danach",
    ]);
  });
});
