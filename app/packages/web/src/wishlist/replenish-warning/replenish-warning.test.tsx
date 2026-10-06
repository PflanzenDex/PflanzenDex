// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
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
