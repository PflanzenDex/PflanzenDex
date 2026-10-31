// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import type { SpecimenCard } from "@pflanzendex/core";
import { PlantTile } from "./plant-tile";

afterEach(cleanup);

const card = {
  id: "s1",
  name: "Aloe",
  photo: null,
  lightZone: null,
  treatment: null,
  lastMeasurement: null,
} as unknown as SpecimenCard;

describe("US-QS-19 a plant tile without a photo (issue 1045)", () => {
  it("US-QS-19 the initial sits on the tile, without a second box that reads as a double border", () => {
    const { container } = render(
      <MemoryRouter>
        <PlantTile card={card} access={{} as never} />
      </MemoryRouter>,
    );
    const initial = container.querySelector("[data-initial]");
    expect(initial?.getAttribute("data-initial")).toBe("A");
    expect(initial?.className).not.toContain("bg-muted");
    expect(screen.getByRole("button", { name: /Aloe/ })).toBeTruthy();
  });
});
