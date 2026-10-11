// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import type { Replenishment } from "@pflanzendex/core";
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
      name: "Lampe 3",
      open: 1,
      text: "Nachschub nötig: Lampe 3 (1 offener Kandidat)",
    },
  ],
  nextAction: "Erfasse einen Wunsch mit Ziel-Zone Lampe 3 (Formular „Wunsch erfassen“).",
};

describe("US-WUN-02 replenishment warning in the wishlist", () => {
  it("US-WUN-02 shows the warning per zone below the buffer with what to do next", () => {
    render(<ReplenishWarning replenishment={low} />);
    expect(screen.getByRole("status").textContent).toContain(
      "Nachschub nötig: Lampe 3 (1 offener Kandidat)",
    );
    expect(screen.getByText(/Erfasse einen Wunsch mit Ziel-Zone Lampe 3/)).toBeTruthy();
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
    const link = screen.getByRole("link", { name: "Entdecken für Lampe 3" });
    expect(link.getAttribute("href")).toBe("/discover?view=suggestions&zone=3");
  });

  it("US-ENT-07 offers no link while the action does not exist", () => {
    render(<ReplenishWarning replenishment={low} />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});
