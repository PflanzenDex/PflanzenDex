// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { ConfirmResult, ImportPreview, PreviewRow } from "@pflanzendex/core";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeaturesProvider } from "@/shared/data";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { ChooseStep } from "../../../collection/other-pages/import-page/views/choose-step/choose-step";
import { FailureNote } from "../../../collection/other-pages/import-page/views/failure-note/failure-note";
import { ImportEntry } from "../../../collection/other-pages/import-page/views/import-entry/import-entry";
import { MarkerAnswers } from "../../../collection/other-pages/import-page/views/preview-step/marker-answers/marker-answers";
import { RowFixControls } from "../../../collection/other-pages/import-page/views/preview-step/preview-row/row-fix/row-fix";
import { PreviewStep } from "../../../collection/other-pages/import-page/views/preview-step/preview-step";
import { ResultStep } from "../../../collection/other-pages/import-page/views/result-step/result-step";
import type { Flow, ImportFlow } from "../../../collection/other-pages/import-page/import-flow";
import { filledIn, isFilled, isPlain, isTinted } from "./button-roles";

// US-QS-32 (SG-BTN-01, SG-BTN-02), FX-39 sweep 1: the CSV import of "Sammlung". Each step has one filled action; the
// fixes of a row and the secondary actions are tinted, going back is plain.
beforeEach(() => setViewportWidth(360));
afterEach(cleanup);

const START: Flow = {
  step: "choose",
  arrivals: 0,
  file: null,
  fileError: null,
  preview: null,
  fixes: {},
  answers: [],
  busy: false,
  failure: null,
  notice: null,
  result: null,
};

/** A flow in a given state with every action a spy: the steps read the state and call the actions (US-BES-18). */
const flowOf = (state: Partial<Flow> = {}): ImportFlow => ({
  flow: { ...START, ...state },
  choose: vi.fn(),
  review: vi.fn(),
  fix: vi.fn(),
  answer: vi.fn(),
  confirm: vi.fn(),
  retry: vi.fn(),
  back: vi.fn(),
  again: vi.fn(),
});

const row = (over: Partial<PreviewRow> & { line: number }): PreviewRow => ({
  state: "ready",
  species: { name: "Ficus", id: "f1", candidates: [], more: false },
  nickname: null,
  marker: null,
  specimenName: "Geigenfeige",
  location: null,
  catchDate: null,
  notes: null,
  reasons: [],
  ...over,
});
const preview = (rows: PreviewRow[], ready: number): ImportPreview => ({
  rows,
  counts: { ready, flagged: rows.length - ready, alreadyThere: 0, skipped: 0 },
  newLocations: [],
  markers: [],
});
const failure = { code: "server.error", text: "Der Server antwortet nicht." };
const button = (name: string | RegExp) => screen.getByRole("button", { name });
const inRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe("US-QS-32 · SG-BTN-01 the import: choose the file", () => {
  it("US-QS-32 'Vorschau ansehen' is the one filled button, the template is tinted, the retry of a failure is tinted", () => {
    render(
      <ChooseStep view={flowOf({ file: { name: "a.csv", text: "x" }, failure })} moved={false} />,
    );
    expect(filledIn(document.body).map((b) => b.textContent)).toEqual(["Vorschau ansehen"]);
    expect(isTinted(button("Vorlage herunterladen"))).toBe(true);
    expect(isTinted(button("Erneut versuchen"))).toBe(true);
  });

  it("US-QS-32 a failure note offers its retry as a tinted button, not a filled one", () => {
    render(<FailureNote error={failure} onRetry={vi.fn()} />);
    expect(isTinted(button("Erneut versuchen"))).toBe(true);
    expect(filledIn(document.body)).toHaveLength(0);
  });
});

describe("US-QS-32 · SG-BTN-02 the import: the preview", () => {
  it("US-QS-32 the import is the one filled button, 'Andere Datei wählen' is plain", () => {
    const view = flowOf({
      step: "preview",
      file: { name: "a.csv", text: "x" },
      preview: preview([row({ line: 2 })], 1),
    });
    inRouter(<PreviewStep view={view} moved={false} />);
    expect(filledIn(document.body).map((b) => b.textContent)).toEqual(["1 Pflanze importieren"]);
    expect(isPlain(button("Andere Datei wählen"))).toBe(true);
  });

  it("US-QS-32 the fixes of a flagged row are tinted, 'Zeile überspringen' stays neutral, nothing is filled", () => {
    const flagged = row({
      line: 3,
      state: "flagged",
      species: {
        name: "Monstera",
        id: null,
        candidates: [{ id: "m1", name: "Fensterblatt" }],
        more: false,
      },
      reasons: [{ code: "specimen.marker_required", field: "nickname" }],
    });
    render(<RowFixControls row={flagged} onFix={vi.fn()} />);
    expect(isTinted(button("Diese Art wählen: Fensterblatt"))).toBe(true);
    expect(isTinted(button("Kennzeichen übernehmen"))).toBe(true);
    expect(isFilled(button("Zeile überspringen"))).toBe(false);
    expect(filledIn(document.body)).toHaveLength(0);
  });

  it("US-QS-32 a skipped row can be taken back with a tinted button", () => {
    render(<RowFixControls row={row({ line: 4, state: "skipped" })} onFix={vi.fn()} />);
    expect(isTinted(button("Zeile doch aufnehmen"))).toBe(true);
    expect(filledIn(document.body)).toHaveLength(0);
  });

  it("US-QS-32 a marker the file needs is answered with a tinted button", () => {
    render(
      <MarkerAnswers
        requests={[{ speciesId: "f1", speciesName: "Ficus", missing: [{ id: "e1", name: "Pit" }] }]}
        onAnswer={vi.fn()}
      />,
    );
    expect(isTinted(button("Kennzeichen übernehmen"))).toBe(true);
    expect(filledIn(document.body)).toHaveLength(0);
  });
});

describe("US-QS-32 · SG-BTN-02 the import: the result and the entry", () => {
  const result: ConfirmResult = {
    created: [{ line: 2, id: "e1", name: "Geigenfeige" }],
    skipped: [],
    refused: [],
    locationsCreated: [],
    unusedMarkers: [],
  };

  it("US-QS-32 'Zur Sammlung' is the one filled link, 'Weitere Datei importieren' is tinted", () => {
    inRouter(<ResultStep view={flowOf({ step: "result", result })} moved={false} />);
    expect(filledIn(document.body).map((b) => b.textContent)).toEqual(["Zur Sammlung"]);
    expect(isTinted(button("Weitere Datei importieren"))).toBe(true);
  });

  it("US-QS-32 the entry 'Aus Datei importieren' is a tinted link, never a second filled action", () => {
    inRouter(
      <FeaturesProvider features={{ csv_import: true }}>
        <ImportEntry />
      </FeaturesProvider>,
    );
    const entry = screen.getByRole("link", { name: "Aus Datei importieren" });
    expect(isTinted(entry)).toBe(true);
    expect(isFilled(entry)).toBe(false);
  });
});
