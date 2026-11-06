// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { SpecimenCard } from "@pflanzendex/core";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MeasureButton, PlantOverview } from "./plant-overview";

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
  const overview = (water?: React.ReactNode) =>
    render(
      <MemoryRouter>
        <PlantOverview card={CARD} access={ACCESS} onTreat={vi.fn()} water={water} />
      </MemoryRouter>,
    );

  it("NFR-13 the row of Gießen, Behandeln and Notizen may wrap, so at 200 % text the buttons stay inside their column", () => {
    overview(<button type="button">Gießen</button>);
    const treat = screen.getByRole("button", { name: "Behandeln: Birkenfeige" });
    const classes = (treat.parentElement as HTMLElement).className.split(" ");
    expect(classes).toEqual(
      expect.arrayContaining(["flex", "flex-wrap", "[&>button]:grow", "[&>button]:basis-1/4"]),
    );
    expect(classes).not.toContain("grid-cols-2");
    expect(screen.getByRole("button", { name: "Gießen" }).parentElement).toBe(treat.parentElement);
    expect(screen.getByRole("button", { name: "Notizen: Birkenfeige" }).parentElement).toBe(
      treat.parentElement,
    );
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

  it("NFR-13 a message of the Gießen slot takes a row of its own below the buttons", () => {
    overview(<p role="status">gegossen</p>);
    const row = screen.getByRole("status").parentElement as HTMLElement;
    expect(row.className.split(" ")).toContain("[&>p]:basis-full");
  });

  it("US-QS-23 shows the texts of the table, with unknown values as unbekannt", () => {
    overview();
    expect(screen.getByRole("button", { name: "Behandeln: Birkenfeige" }).textContent).toBe(
      "Behandeln",
    );
    expect(screen.getByText("Trend: unbekannt")).toBeTruthy();
    expect(screen.getByText(/^Art: Ficus benjamina · Status: /)).toBeTruthy();
    expect(screen.getByText("Zustand:", { exact: false })).toBeTruthy();
  });

  it("US-QS-23 the measure button names its plant", () => {
    render(<MeasureButton card={CARD} onMeasure={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Messen: Birkenfeige" }).textContent).toBe("Messen");
  });
});
