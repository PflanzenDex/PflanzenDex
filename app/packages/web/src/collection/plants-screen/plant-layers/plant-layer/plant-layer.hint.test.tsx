// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import type { SpecimenCard } from "@pflanzendex/core";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { LayerHost } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { EMPTY_DISTRIBUTION } from "../../../insights/distribution-test-helpers";
import { PlantsScreen } from "../../plants-screen";
import { pagesOf, summaryOf } from "../../../specimens/tests/plants-test-helpers";
import { plantHintOccasionsOf, type PlantHint, type PlantSlots } from "../layer-ids";

beforeAll(() => {
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
});
afterEach(cleanup);

const card = (extra: Partial<SpecimenCard> = {}): SpecimenCard => ({
  id: "e1",
  name: "Aloe",
  speciesId: "a1",
  marker: null,
  speciesName: "Aloe vera",
  status: "plant",
  location: "Regal Süd",
  lightZone: "Zone 3",
  lightZoneSource: "location",
  lightNeedUnknown: false,
  caughtAt: "2026-09-01",
  photo: null,
  lastMeasurement: null,
  treatment: null,
  provenance: null,
  moreTreatments: 0,
  ...extra,
});

const SLOTS: PlantSlots = {
  growth: () => <p>Trend: stabil</p>,
  history: () => <p>Verlauf der Messungen</p>,
  care: () => <p>Behandlungen der Pflanze</p>,
};

/** The occasions each render of the layer asked its hint host for. */
let asked: (readonly string[])[] = [];

/**
 * The app's hint host of the plant layer (US-ONB-07), as a stand-in: it gives `children` the note of `due` at each place
 * the layer asks for. The real host (one request, the lazy note) is tested beside the app's hint code.
 */
function hintHost(due: string | null): PlantHint {
  return function Host({ applicable, children }): ReactNode {
    asked = [...asked, applicable];
    return children((occasion) =>
      occasion === due ? (
        <aside role="status" aria-label="Hinweis">{`NOTE ${occasion}`}</aside>
      ) : null,
    );
  };
}

type Extra = Partial<Parameters<typeof PlantsScreen>[0]>;
function show(cards: SpecimenCard[], extra: Extra = {}) {
  return render(
    <MemoryRouter initialEntries={["/start", "/"]} initialIndex={0}>
      <LayerHost>
        <PlantsScreen
          cards={cards}
          plants={pagesOf(cards)}
          summary={summaryOf(cards)}
          distribution={EMPTY_DISTRIBUTION.distribution}
          archived={[]}
          photoAccess={{ api: "http://api", token: async () => "tok" }}
          onSpeciesChoose={vi.fn()}
          onManage={vi.fn()}
          onRestore={vi.fn()}
          onArchivedCatchDate={vi.fn()}
          embedded
          slots={{ ...SLOTS, hint: hintHost(null) }}
          {...extra}
        />
      </LayerHost>
    </MemoryRouter>,
  );
}

const open = async () => {
  await userEvent.click(await screen.findByRole("button", { name: /^Aloe(\s|$)/ }));
  return screen.findByRole("dialog", { name: "Aloe" });
};

describe("US-ONB-07 the occasions of the plant layer come from the summary over all plants (FR-BES-23)", () => {
  const summary = (extra: { total?: number; anyMeasured?: boolean }) => ({
    total: 0,
    anyMeasured: false,
    ...extra,
  });

  it("US-ONB-07 no plant, or several plants with one of them measured, leaves no occasion", () => {
    expect(plantHintOccasionsOf(summary({}))).toEqual([]);
    expect(plantHintOccasionsOf(summary({ total: 2, anyMeasured: true }))).toEqual([]);
  });

  it("US-ONB-07 the first plant stays the occasion of the one active plant, measured or not (as counts.specimens === 1 before)", () => {
    expect(plantHintOccasionsOf(summary({ total: 1, anyMeasured: true }))).toEqual([
      "first_plant_saved",
    ]);
  });

  it("US-ONB-07 · US-QS-32 the only active plant that is not measured yet has both occasions, the first in the fixed order first", () => {
    expect(plantHintOccasionsOf(summary({ total: 1 }))).toEqual([
      "first_plant_saved",
      "first_measurement",
    ]);
  });

  it("US-ONB-07 more plants and none measured yet: only the measurement occasion", () => {
    expect(plantHintOccasionsOf(summary({ total: 3 }))).toEqual(["first_measurement"]);
  });
});

describe("US-ONB-07 · US-QS-32 the plant layer places its calm hint", () => {
  it("US-ONB-07 the layer hands its host both occasions that apply, in one list", async () => {
    setViewportWidth(360);
    asked = [];
    show([card()], { onMeasure: vi.fn() });
    await open();
    expect(asked.at(-1)).toEqual(["first_plant_saved", "first_measurement"]);
  });

  it("US-ONB-07 · US-QS-32 when no occasion applies the host gets an empty list", async () => {
    setViewportWidth(360);
    asked = [];
    show(
      [
        card({
          lastMeasurement: { date: "2026-10-01", value: 12, quality: "healthy", note: null },
        }),
      ],
      {
        onMeasure: vi.fn(),
        summary: { ...summaryOf([card()]), total: 2, anyMeasured: true },
      },
    );
    await open();
    expect(asked.at(-1)).toEqual([]);
  });

  it("US-ONB-07 · US-QS-32 the note of first_plant_saved stands directly after Messen, in the primary place of the layer", async () => {
    setViewportWidth(360);
    show([card()], {
      onMeasure: vi.fn(),
      slots: { ...SLOTS, hint: hintHost("first_plant_saved") },
    });
    const layer = await open();
    const measure = within(layer).getByRole("button", { name: "Messen: Aloe" });
    const note = within(layer).getByText("NOTE first_plant_saved");
    expect(measure.nextElementSibling).toBe(note);
    expect(within(layer).queryByText("NOTE first_measurement")).toBeNull();
  });

  it("US-ONB-07 · US-QS-32 the note of first_measurement stands at the growth line, before the treatment buttons", async () => {
    setViewportWidth(360);
    show([card()], {
      onMeasure: vi.fn(),
      slots: { ...SLOTS, hint: hintHost("first_measurement") },
    });
    const layer = await open();
    const growth = within(layer).getByText("Trend: stabil");
    const note = within(layer).getByText("NOTE first_measurement");
    expect(growth.nextElementSibling).toBe(note);
    expect(within(layer).queryByText("NOTE first_plant_saved")).toBeNull();
    expect(
      note.compareDocumentPosition(within(layer).getByRole("button", { name: "Behandeln: Aloe" })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("US-ONB-07 the notes are part of the overview only: on the tab Pflege neither stands", async () => {
    setViewportWidth(360);
    show([card()], {
      onMeasure: vi.fn(),
      slots: { ...SLOTS, hint: hintHost("first_plant_saved") },
    });
    const layer = await open();
    expect(within(layer).getByText("NOTE first_plant_saved")).toBeTruthy();
    await userEvent.click(within(layer).getByRole("tab", { name: "Pflege" }));
    expect(within(layer).queryByText("NOTE first_plant_saved")).toBeNull();
  });

  it("US-ONB-07 the layer without a hint host keeps its place for the notes: Messen and the growth line stay as they are", async () => {
    setViewportWidth(360);
    show([card()], { onMeasure: vi.fn(), slots: SLOTS });
    const layer = await open();
    const measure = within(layer).getByRole("button", { name: "Messen: Aloe" });
    expect(measure.nextElementSibling).toBeNull();
    expect(within(layer).getByText("Trend: stabil").nextElementSibling).not.toBeNull();
  });
});
