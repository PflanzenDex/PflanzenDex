// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Candidate } from "@pflanzendex/core";
import { WishRow } from "./wish-row";

afterEach(cleanup);

const wish = {
  id: "w1",
  title: "Aloe (Aloe vera)",
  zoneText: "Zone 2 · 3 Pflanzen",
  difficulty: null,
  priority: { kind: "thinnest" },
} as unknown as Candidate;

function show() {
  return render(
    <MemoryRouter>
      <WishRow c={wish} rank={1} onBuy={vi.fn()} onDiscard={vi.fn()} busy={false} />
    </MemoryRouter>,
  );
}

describe("US-QS-22 a compact wish row (issue 1045)", () => {
  it("US-QS-22 the row stays on one line: no wrapping of the actions below the wish", () => {
    const { container } = show();
    expect(container.firstElementChild?.className).not.toContain("flex-wrap");
  });

  it("US-QS-22 · P-08 an unknown difficulty is labelled, not a bare unbekannt", () => {
    show();
    const open = screen.getByRole("button", { name: /^1\. Aloe/ });
    expect(open.textContent).toContain("Schwierigkeit: unbekannt");
    expect(open.textContent).toContain("Zone 2 · 3 Pflanzen");
    expect(open.textContent).not.toContain("—");
  });
});
