// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import type { Replenishment } from "@pflanzendex/core";
import { filledIn, hasOwnBorder, isTinted } from "@/shared/ui/button.roles";
import { ReplenishWarning } from "./replenish-warning";

afterEach(cleanup);

const none: Replenishment = {
  buffer: 2,
  zones: [],
  actions: { discover: false, suggestions: false },
  nextAction: null,
};
const low: Replenishment = {
  ...none,
  zones: [
    {
      zoneId: "z3",
      zoneNumber: 3,
      name: "Zone 3",
      open: 1,
      text: "Zone 3 braucht Nachschub (1 offener Kandidat).",
    },
  ],
  nextAction: "Erfasse einen Wunsch mit Ziel-Zone Zone 3 (Formular „Wunsch erfassen“).",
};

describe("US-WUN-02 replenishment warning in the wishlist", () => {
  it("US-WUN-02 shows the warning per zone below the buffer with what to do next", () => {
    render(<ReplenishWarning replenishment={low} />);
    expect(screen.getByRole("status").textContent).toContain(
      "Zone 3 braucht Nachschub (1 offener Kandidat).",
    );
    expect(screen.getByText(/Erfasse einen Wunsch mit Ziel-Zone Zone 3/)).toBeTruthy();
  });

  it("US-WUN-02 shows nothing while every zone has the buffer", () => {
    const { container } = render(<ReplenishWarning replenishment={none} />);
    expect(container.textContent).toBe("");
  });
});

describe("US-ENT-07 Discover for the zone from the warning", () => {
  const withDiscover: Replenishment = { ...low, actions: { discover: true, suggestions: false } };

  it("US-ENT-07 offers Discover for each zone below the buffer, filtered to that zone", () => {
    render(
      <MemoryRouter>
        <ReplenishWarning replenishment={withDiscover} />
      </MemoryRouter>,
    );
    const link = screen.getByRole("link", { name: "Entdecken für Zone 3" });
    expect(link.getAttribute("href")).toBe("/discover?view=suggestions&zone=3");
  });

  it("US-ENT-07 offers no link while the action does not exist", () => {
    render(<ReplenishWarning replenishment={low} />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("US-QS-32 · SG-BTN-01 Discover for the zone is a tinted button, not an outline", () => {
  it("US-QS-32 · SG-BTN-02 each zone's one action is tinted without a border, and the hint has no filled button", () => {
    const two: Replenishment = {
      ...low,
      actions: { discover: true, suggestions: false },
      zones: [
        ...low.zones,
        {
          ...(low.zones[0] as (typeof low.zones)[number]),
          zoneId: "z4",
          zoneNumber: 4,
          name: "Zone 4",
        },
      ],
    };
    const { container } = render(
      <MemoryRouter>
        <ReplenishWarning replenishment={two} />
      </MemoryRouter>,
    );
    const links = screen.getAllByRole("link", { name: /^Entdecken für / });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(isTinted(link)).toBe(true);
      expect(hasOwnBorder(link)).toBe(false);
    }
    expect(filledIn(container)).toEqual([]);
  });
});

describe("US-WUN-02 a suggestion is not an alarm (issue 1045)", () => {
  it("US-WUN-02 the replenishment hint has no alarm-red border", () => {
    const { container } = render(<ReplenishWarning replenishment={low} />);
    const box = container.querySelector("[role='status']");
    expect(box?.className).not.toContain("border-destructive");
    expect(box?.className).toContain("border-border");
  });
});
