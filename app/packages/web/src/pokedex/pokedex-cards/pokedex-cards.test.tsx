// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import type { CaughtSpecies } from "@pflanzendex/core";
import { SpeciesRow } from "./pokedex-cards";

afterEach(cleanup);

const species = {
  species: "Phalaenopsis amabilis",
  speciesId: "s1",
  source: null,
  genus: "Phalaenopsis",
  chips: [],
  specimenCount: 1,
  caughtDate: { date: "2026-09-07", source: "caught_at" },
  germanName: "Schmetterlingsorchidee",
  familyLatin: null,
  familyGerman: null,
  genusSpeciesCount: null,
} as CaughtSpecies;

const classesOf = (el: HTMLElement) => el.className.split(" ");

describe("US-QS-32 a caught species row hyphenates its German name, never its scientific name (issue 2366)", () => {
  it("US-QS-32 with a German name the name is hyphens-auto and the scientific name on the meta line is hyphens-manual", () => {
    render(
      <MemoryRouter>
        <SpeciesRow c={species} />
      </MemoryRouter>,
    );
    const name = screen.getByText("Schmetterlingsorchidee");
    expect(classesOf(name)).toContain("hyphens-auto");
    expect(classesOf(screen.getByText("Phalaenopsis amabilis"))).toContain("hyphens-manual");
  });

  it("US-QS-32 without a German name the scientific name is the title, hyphens-manual inside the hyphenating title", () => {
    render(
      <MemoryRouter>
        <SpeciesRow c={{ ...species, germanName: null }} />
      </MemoryRouter>,
    );
    const latin = screen.getByText("Phalaenopsis amabilis");
    expect(latin.tagName).toBe("I");
    expect(classesOf(latin)).toContain("hyphens-manual");
    expect(classesOf(latin.parentElement as HTMLElement)).toContain("hyphens-auto");
  });
});
