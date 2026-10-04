import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { LightOverviewView } from "./light-overview-view";
import type { LightOverview } from "./light-api";

describe("US-LIC-03: light overview view", () => {
  it("shows empty state when no species have active specimens and lux demand", () => {
    const data: LightOverview = { rows: [] };
    render(<LightOverviewView data={data} />);

    expect(screen.getByText(/noch keine arten/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /zum bestand/i })).toBeInTheDocument();
  });

  it("displays table with plant, zone, lux demand (de-DE), and position", () => {
    const data: LightOverview = {
      rows: [
        {
          speciesId: "sp1",
          speciesName: "Monstera deliciosa",
          lightDemandLux: 15000,
          position: { category: "very_close", description: "sehr nah (~10 cm)" },
          zone: {
            id: "z2",
            name: "Lamp 2",
            luxCeiling: 15000,
            ppfd: 300,
            sortOrder: 1,
          },
        },
      ],
    };

    render(<LightOverviewView data={data} />);

    // Check table structure
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Monstera deliciosa")).toBeInTheDocument();
    expect(screen.getByText("Lamp 2")).toBeInTheDocument();
    expect(screen.getByText("sehr nah (~10 cm)")).toBeInTheDocument();

    // Check lux is formatted de-DE (with dots as thousand separators in German)
    expect(screen.getByText("15.000")).toBeInTheDocument();
  });

  it("sorts rows by lux demand descending (highest first)", () => {
    const data: LightOverview = {
      rows: [
        {
          speciesId: "sp1",
          speciesName: "High Light Plant",
          lightDemandLux: 100000,
          position: { category: "directly_under_lamp", description: "direkt unter der Lampe" },
          zone: { id: "z3", name: "Zone 3", luxCeiling: 100000, ppfd: null, sortOrder: 2 },
        },
        {
          speciesId: "sp2",
          speciesName: "Low Light Plant",
          lightDemandLux: 2000,
          position: { category: "further_away", description: "darf weiter weg stehen" },
          zone: { id: "z1", name: "Zone 1", luxCeiling: 15000, ppfd: 300, sortOrder: 0 },
        },
      ],
    };

    const { container } = render(<LightOverviewView data={data} />);
    const rows = container.querySelectorAll("tbody tr");

    expect(rows[0].textContent).toContain("High Light Plant");
    expect(rows[1].textContent).toContain("Low Light Plant");
  });

  it("displays position recommendations in German", () => {
    const data: LightOverview = {
      rows: [
        {
          speciesId: "sp1",
          speciesName: "Test",
          lightDemandLux: 25000,
          position: { category: "very_close", description: "sehr nah (~10 cm)" },
          zone: { id: "z2", name: "Zone 2", luxCeiling: 15000, ppfd: 300, sortOrder: 1 },
        },
      ],
    };

    render(<LightOverviewView data={data} />);
    expect(screen.getByText("sehr nah (~10 cm)")).toBeInTheDocument();
  });

  it("shows helpful hint in empty state about next steps", () => {
    const data: LightOverview = { rows: [] };
    render(<LightOverviewView data={data} />);

    // Check for both empty state message and action link
    expect(screen.getByText(/lege ein exemplar an/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /zum bestand/i })).toHaveAttribute("href", "/bestand");
  });
});
