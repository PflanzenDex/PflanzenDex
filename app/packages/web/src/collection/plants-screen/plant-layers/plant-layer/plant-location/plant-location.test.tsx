// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { SpecimenCard } from "@pflanzendex/core";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { PlantLocation } from "./plant-location";

afterEach(cleanup);

const CARD: SpecimenCard = {
  id: "e1",
  name: "Birkenfeige",
  speciesId: "a1",
  marker: null,
  speciesName: "Ficus benjamina",
  status: "plant",
  location: null,
  lightZone: null,
  lightZoneSource: null,
  lightNeedUnknown: false,
  caughtAt: "2026-09-01",
  photo: null,
  lastMeasurement: null,
  treatment: null,
  moreTreatments: 0,
  provenance: null,
};

describe("US-LIC-01 the plant card names the next step of an unknown light need (P-09)", () => {
  it("US-LIC-01: Given a species without lux need and no zone, when the location is shown, then Lichtbedarf eintragen links to its care profile", () => {
    render(
      <MemoryRouter>
        <PlantLocation card={{ ...CARD, lightNeedUnknown: true }} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Lichtzone: unbekannt")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Lichtbedarf eintragen für „Ficus benjamina“" })
        .getAttribute("href"),
    ).toBe("/discover/species/a1?sheet=care");
  });

  it("US-LIC-01: Given a known light need, when the location is shown, then no next step is named", () => {
    render(
      <MemoryRouter>
        <PlantLocation card={CARD} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("link", { name: /Lichtbedarf eintragen/ })).toBeNull();
  });
});
