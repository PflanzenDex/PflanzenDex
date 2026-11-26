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
  /** The overview, and the cell it gives to the result of "Gießen" (`resultRef`, the layer hands it to the quick actions). */
  const overview = () => {
    const cell: { host: HTMLElement | null } = { host: null };
    render(
      <MemoryRouter>
        <PlantOverview
          card={CARD}
          access={ACCESS}
          onTreat={vi.fn()}
          resultRef={(host) => {
            cell.host = host;
          }}
        />
      </MemoryRouter>,
    );
    return cell;
  };

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

  it("US-QS-32 · SG-FEED-05 the cell for the result of Gießen is the cell of the 'Art · Status' line, not part of a row of buttons (issue 2462)", () => {
    const cell = overview();
    const facts = screen.getByText(/^Art: Ficus benjamina · Status: /);
    const host = cell.host as HTMLElement;
    expect(host).toBeTruthy();
    // Both stand in one grid cell: the cell is as high as the taller of the two, so the line coming and going moves nothing.
    expect(host.parentElement).toBe(facts.parentElement);
    expect(facts.className.split(" ")).toEqual(
      expect.arrayContaining(["col-start-1", "row-start-1"]),
    );
    expect(host.className.split(" ")).toEqual(
      expect.arrayContaining(["col-start-1", "row-start-1"]),
    );
    // The facts line is hidden, not removed, while the cell holds a result: `invisible` keeps its height and leaves the
    // reading order.
    expect(facts.className.split(" ")).toContain("group-has-[>div:not(:empty)]:invisible");
    expect((facts.parentElement as HTMLElement).className.split(" ")).toContain("group");
    const row = screen.getByRole("button", { name: "Behandeln: Birkenfeige" })
      .parentElement as HTMLElement;
    expect(row.contains(host)).toBe(false);
    expect(row.querySelector("p")).toBeNull();
  });

  it("US-QS-32 · SG-FEED-05 without a result the cell holds only the facts line: its host is an empty box, so nothing is hidden", () => {
    overview();
    const facts = screen.getByText(/^Art: Ficus benjamina · Status: /);
    expect(facts.nextElementSibling?.tagName).toBe("DIV");
    expect(facts.nextElementSibling?.childElementCount).toBe(0);
    expect(facts.nextElementSibling?.textContent).toBe("");
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
