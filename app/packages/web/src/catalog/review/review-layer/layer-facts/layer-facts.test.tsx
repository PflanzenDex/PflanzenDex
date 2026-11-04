// @vitest-environment jsdom
import type { ReviewEntry } from "@pflanzendex/core";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LayerFacts } from "./layer-facts";

const NOW = Date.parse("2026-10-10T12:00:00Z");

const species = (over: Record<string, unknown> = {}) => ({
  id: "s1",
  latinName: "Echeveria elegans",
  difficulty: 2,
  standardLevel: 3,
  lightDemandLux: 40000,
  dormancyFrom: "11-01",
  dormancyUntil: "02-15",
  growthMeasure: "rosette_diameter",
  etiolationSigns: "Rosette streckt sich.",
  successCriteria: "Dichte Rosette.",
  source: "RHS",
  ...over,
});

/** One review case as the facts tab receives it; `status` `curated` is an approved operator batch. */
const entry = (over: Record<string, unknown> = {}, status = "proposal"): ReviewEntry =>
  ({
    reviewCase: {
      id: "c1",
      status,
      createdAt: "2026-10-07T08:00:00Z",
    },
    species: species(over),
    aiCreated: false,
    issues: [],
    similar: [],
  }) as unknown as ReviewEntry;

afterEach(() => cleanup());

describe("NFR-13 the review case facts at a larger text size (issue 1229)", () => {
  it("NFR-13 each label stands beside its value only from 12 rem on, and above it in a narrower box, so a long label cannot push its value out of the box", () => {
    render(<LayerFacts entry={entry()} now={NOW} />);
    const list = screen.getByText("Schwierigkeit").closest("dl");
    expect(list).not.toBeNull();
    const container = list?.parentElement;
    expect(container?.className).toContain("@container");
    expect(list?.className).toContain("grid-cols-1");
    expect(list?.className).toContain("@min-[12rem]:grid-cols-[auto_minmax(0,1fr)]");
    expect(list?.className).toContain("[overflow-wrap:anywhere]");
    for (const label of ["Schwierigkeit", "Vergeilungsanzeichen", "Quelle"]) {
      const row = screen.getByText(label).parentElement;
      expect(row?.tagName).toBe("DIV");
      expect(row?.className).toContain("flex-col");
      expect(row?.className).toContain("@min-[12rem]:contents");
    }
  });

  it("NFR-13 every fact keeps its German label and value, and an unknown value reads unbekannt (P-08)", () => {
    render(<LayerFacts entry={entry({ etiolationSigns: null, source: null })} now={NOW} />);
    const etiolation = screen.getByText("Vergeilungsanzeichen").parentElement;
    expect(within(etiolation as HTMLElement).getByText("unbekannt")).toBeTruthy();
    expect(screen.getByText("Quelle").parentElement?.textContent).toContain("unbekannt");
    expect(screen.queryByText("Rosette streckt sich.", { exact: false })).toBeNull();
  });

  it("NFR-13 an operator batch names its status in German and says what is still missing for a proposal", () => {
    const { rerender } = render(<LayerFacts entry={entry({}, "curated")} now={NOW} />);
    expect(screen.getByText(/Betreiber-Charge, bereits freigegeben/)).toBeTruthy();
    rerender(
      <LayerFacts
        entry={
          { ...entry(), issues: [{ field: "source", reason: "source_missing" }] } as ReviewEntry
        }
        now={NOW}
      />,
    );
    expect(screen.getByText(/Nutzervorschlag/)).toBeTruthy();
    expect(
      screen.getByText(
        "Freigabe noch nicht möglich: Quelle fehlt (Pflicht für Lichtbedarf und Ruhephase).",
      ),
    ).toBeTruthy();
  });
});
