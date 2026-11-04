// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { Species } from "@pflanzendex/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SpeciesProfile } from "./profile-view";

const species: Species = {
  id: "a1",
  latinName: "Dracaena trifasciata",
  genus: "Dracaena",
  epithet: "trifasciata",
  cultivar: null,
  germanName: "Bogenhanf",
  englishName: null,
  synonyms: [],
  familyGerman: null,
  familyLatin: "Asparagaceae",
  difficulty: 1,
  standardLevel: 2,
  lightDemandLux: 15000,
  softLeaf: false,
  dormancyFrom: null,
  dormancyUntil: null,
  locationHint: null,
  growthMeasure: "height",
  etiolationSigns: "Blätter kippen zur Seite.",
  wateringHint: null,
  substrate: null,
  pruning: null,
  growthHacks: null,
  successCriteria: "Aufrechte Blätter.",
  botanicalStory: null,
  source: null,
  reviewStatus: "reviewed",
  createdBy: "user",
  own: false,
  version: 1,
};

/** The action bar and the two parts of the profile around it: the header above, the facts below. */
function parts() {
  const bar = screen.getByRole("button", { name: "Diese Art wählen" }).parentElement as HTMLElement;
  return {
    bar,
    header: bar.previousElementSibling as HTMLElement,
    facts: bar.nextElementSibling as HTMLElement,
  };
}

describe("NFR-13 the action bar of the profile at a larger text size (issue 1217)", () => {
  afterEach(() => cleanup());

  it("NFR-13 the bar sits in the flow between the header and the facts, so no part of the profile lies under it", () => {
    render(
      <SpeciesProfile
        species={species}
        onChoose={vi.fn()}
        extra={<button type="button">Mein Pflegeprofil</button>}
      />,
    );
    const { bar, header, facts } = parts();
    expect(header.contains(screen.getByRole("heading", { level: 1 }))).toBe(true);
    expect(facts.contains(screen.getByRole("tablist"))).toBe(true);
    expect(bar.contains(screen.getByRole("button", { name: "Mein Pflegeprofil" }))).toBe(true);
    expect(bar.parentElement?.tagName.toLowerCase()).toBe("article");
  });

  it("NFR-13 the bar is not sticky or fixed, so no class of the profile pins it over a part of it", () => {
    render(<SpeciesProfile species={species} onChoose={vi.fn()} />);
    const { bar } = parts();
    expect(bar.className).not.toMatch(/\b(sticky|fixed|absolute)\b/);
    expect(bar.closest("article")?.querySelectorAll("[class*='sticky']")).toHaveLength(0);
  });

  it("NFR-13 the header keeps its natural height up to 40 % of the profile and scrolls inside itself beyond it, so the bar stays in view", () => {
    render(<SpeciesProfile species={species} onChoose={vi.fn()} />);
    const { header, facts } = parts();
    expect(header.className).toContain("max-h-[40%]");
    expect(header.className).toContain("overflow-y-auto");
    expect(facts.className).not.toContain("overflow-y-auto");
  });

  it("NFR-13 the focus ring of the way back stays inside the header region: the region has 4 px of padding and the same negative margin", () => {
    render(<SpeciesProfile species={species} onChoose={vi.fn()} />);
    const { header } = parts();
    expect(header.className).toMatch(/(^| )p-1( |$)/);
    expect(header.className).toMatch(/(^| )-m-1( |$)/);
  });

  it("NFR-13 each action takes at least the width of its longest word, so a label stacks instead of overflowing its button, and both actions keep their German labels", () => {
    render(
      <SpeciesProfile
        species={species}
        onChoose={vi.fn()}
        extra={<button type="button">Mein Pflegeprofil</button>}
      />,
    );
    const { bar } = parts();
    expect(bar.className).toContain("[&>*]:min-w-min");
    expect(bar.className).not.toContain("[&>*]:min-w-0");
    expect(bar.textContent).toBe("Diese Art wählenMein Pflegeprofil");
  });
});
