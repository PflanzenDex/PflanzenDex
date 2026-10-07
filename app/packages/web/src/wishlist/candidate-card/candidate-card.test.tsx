// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Candidate } from "@pflanzendex/core";
import { CandidateCard } from "./candidate-card";

const mockCandidate = (overrides: Partial<Candidate> = {}): Candidate => ({
  id: "w1",
  name: "Test Wish",
  german: null,
  title: "Geigenfeige (Ficus lyrata)",
  stock: 1,
  zoneText: "Lampe 3 — 1 Pflanze",
  zone: { id: "z1", name: "Lampe 3" },
  difficulty: 2,
  reasoning: "Mehr Platz in Lampe 4",
  priority: { kind: "thinnest", text: "Hier steht schon 1 Pflanze." },
  image: null,
  ...overrides,
});

describe("US-WUN-01 candidate card rendering", () => {
  it("renders 'Kein Bild' when image URL contains credentials", () => {
    const candidate = mockCandidate({
      image: {
        url: "https://user:password@example.com/image.jpg",
        source: "Example",
      },
    });

    render(<CandidateCard c={candidate} rank={1} />);
    expect(screen.getByText("Kein Bild")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
