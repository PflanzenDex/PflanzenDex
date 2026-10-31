// @vitest-environment jsdom
import { cleanup, render as plainRender, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { RecommendationsView } from "./recommendations-view";

afterEach(cleanup);

const render = (ui: ReactElement) => plainRender(<MemoryRouter>{ui}</MemoryRouter>);

const rec = {
  needId: "supply:1",
  productId: "soil-1",
  name: "Kakteenerde",
  manufacturer: "Erdewerk",
  reason: "„Erde“ wird knapp.",
  label: "Empfehlung" as const,
  source: "https://example.org/erde",
  retrievedOn: "2026-10-01",
  price: { cents: 599, source: "Erdewerk Preisliste", retrievedOn: "2026-10-02" },
  nextAction: "Vergleiche Kakteenerde.",
};

describe("US-EQU-10 recommendations view", () => {
  it("US-EQU-10 labels each suggestion and shows reason, source, date and a sourced price, without a link", () => {
    const { container } = render(
      <RecommendationsView data={{ recommendations: [rec], needs: [{}] }} />,
    );
    expect(screen.getByText("Empfehlung")).toBeTruthy();
    expect(screen.getByText("Grund: „Erde“ wird knapp.")).toBeTruthy();
    expect(screen.getByText(/Quelle: https:\/\/example.org\/erde · Stand 01.10.2026/)).toBeTruthy();
    expect(
      screen.getByText(/5,99 € \(Quelle: Erdewerk Preisliste, Stand 02.10.2026\)/),
    ).toBeTruthy();
    expect(container.querySelector("a")).toBeNull();
  });

  it("US-EQU-10 shows no price line when the product has none", () => {
    render(
      <RecommendationsView data={{ recommendations: [{ ...rec, price: null }], needs: [{}] }} />,
    );
    expect(screen.queryByText(/Preis:/)).toBeNull();
  });

  it("US-EQU-10 names the next step when a need has no catalog match", () => {
    render(<RecommendationsView data={{ recommendations: [], needs: [{}, {}] }} />);
    expect(screen.getByText(/Nächster Schritt/)).toBeTruthy();
  });

  it("US-EQU-10 explains the empty state when nothing is missing", () => {
    render(<RecommendationsView data={{ recommendations: [], needs: [] }} />);
    expect(screen.getByText(/nichts fehlt/)).toBeTruthy();
  });
});
