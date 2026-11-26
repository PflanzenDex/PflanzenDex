// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { SpecimenCard } from "@pflanzendex/core";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlantOverview } from "./plant-overview";

const CARD: SpecimenCard = {
  id: "e1",
  name: "Birkenfeige",
  speciesId: "a1",
  marker: null,
  speciesName: "Ficus benjamina",
  status: "plant",
  location: "Regal Süd",
  lightZone: "Zone 3",
  lightZoneSource: "location",
  lightNeedUnknown: false,
  caughtAt: "2026-09-01",
  photo: null,
  lastMeasurement: null,
  treatment: null,
  provenance: null,
  moreTreatments: 0,
};
const ACCESS = { api: "http://api", token: async () => "tok" };

afterEach(cleanup);

describe("PlantOverview (NFR-13, US-QS-23)", () => {
  const overview = () =>
    render(
      <MemoryRouter>
        <PlantOverview card={CARD} access={ACCESS} onTreat={vi.fn()} />
      </MemoryRouter>,
    );

  it("NFR-13 the row of Behandeln and Notizen may wrap, so at 200 % text the buttons stay inside their column", () => {
    overview();
    const treat = screen.getByRole("button", { name: "Behandeln: Birkenfeige" });
    const classes = (treat.parentElement as HTMLElement).className.split(" ");
    expect(classes).toEqual(
      expect.arrayContaining(["flex", "flex-wrap", "[&>button]:grow", "[&>button]:basis-1/4"]),
    );
    expect(classes).not.toContain("grid-cols-2");
    expect(screen.getByRole("button", { name: "Notizen: Birkenfeige" }).parentElement).toBe(
      treat.parentElement,
    );
  });

  it("US-QS-23 · issue 2424 the overview holds no quick action: Messen, Gießen and Foto stand under the title of the layer", () => {
    overview();
    for (const name of [/^Messen/, /^Gießen/, /^Foto/])
      expect(screen.queryByRole("button", { name })).toBeNull();
  });

  it("NFR-13 the column does not grow with its widest row, and the measurement may move below the photo", () => {
    overview();
    const treat = screen.getByRole("button", { name: "Behandeln: Birkenfeige" });
    const column = treat.parentElement?.parentElement as HTMLElement;
    expect(column.className.split(" ")).toContain("grid-cols-[minmax(0,1fr)]");
    const measurement = screen.getByText("noch keine Messung").parentElement as HTMLElement;
    expect(measurement.className.split(" ")).toEqual(
      expect.arrayContaining(["min-w-min", "flex-1"]),
    );
    expect((measurement.parentElement as HTMLElement).className.split(" ")).toContain("flex-wrap");
  });

  it("US-QS-15 · SG-FEED-05 · issue 2536 the 'Art · Status' line is a plain line: the result of Gießen has no cell here and nothing hides the line", () => {
    overview();
    const facts = screen.getByText(/^Art: Ficus benjamina · Status: /);
    expect(facts.className.split(" ")).not.toContain("invisible");
    expect(facts.className).not.toContain("group-has");
    expect(facts.parentElement?.className.split(" ")).not.toContain("group");
    // Nothing is in the line next to its state and its facts: no empty box that a result is drawn into.
    expect(facts.nextElementSibling).toBeNull();
    expect(facts.parentElement?.querySelector("div")).toBeNull();
  });

  it("US-QS-23 shows the texts of the table, with unknown values as unbekannt", () => {
    overview();
    expect(screen.getByRole("button", { name: "Behandeln: Birkenfeige" }).textContent).toBe(
      "Behandeln",
    );
    expect(screen.getByText("Trend: unbekannt")).toBeTruthy();
    expect(screen.getByText(/^Art: Ficus benjamina · Status: /)).toBeTruthy();
    expect(screen.getByText("Qualität:", { exact: false })).toBeTruthy();
  });
});
