// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import type { TodayItem, TodayList } from "@pflanzendex/core";
import { Below } from "./today-list";

const NBSP = "\u00a0";

const item = (id: string): TodayItem => ({
  id,
  kind: "phase_deviation",
  specimenId: `specimen-${id}`,
  specimenName: `Aloe ${id}`,
  text: `Text ${id}`,
  nextAction: "Prüfe die Phase.",
  target: "care_phases",
});

const list = (upcoming: number, count: number): TodayList => ({
  date: "2026-11-15",
  upcoming,
  items: Array.from({ length: count }, (_, i) => item(`i${i}`)),
});

function renderBelow(value: TodayList) {
  render(
    <MemoryRouter>
      <Below list={value} onOpen={() => undefined} />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
});

describe("US-QS-32 the later treatments of Heute agree in number", () => {
  it("US-QS-32 one later treatment reads '1 Termin später' with a no-break space after the count", () => {
    renderBelow(list(1, 2));
    const line = screen.getByText("1 Termin später");
    expect(line.textContent).toBe(`1${NBSP}Termin später`);
  });

  it("US-QS-32 several later treatments read '3 Termine später'", () => {
    renderBelow(list(3, 2));
    expect(screen.getByText("3 Termine später").textContent).toBe(`3${NBSP}Termine später`);
  });

  it("US-QS-32 without further tasks the later line is the sentence for one, with the count otherwise", () => {
    renderBelow(list(1, 1));
    expect(screen.getByText("Ein weiterer Behandlungstermin steht später an.")).toBeTruthy();
    cleanup();
    renderBelow(list(4, 1));
    expect(screen.getByText(/weitere Behandlungstermine/).textContent).toBe(
      `4${NBSP}weitere Behandlungstermine stehen später an.`,
    );
  });
});
