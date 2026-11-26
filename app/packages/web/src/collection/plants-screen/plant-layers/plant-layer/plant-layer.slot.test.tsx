// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import type { SpecimenCard } from "@pflanzendex/core";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { LayerHost } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { EMPTY_DISTRIBUTION } from "../../../insights/distribution-test-helpers";
import { PlantsScreen } from "../../plants-screen";
import { pagesOf, summaryOf } from "../../../specimens/tests/plants-test-helpers";
import type { PlantSlots } from "../layer-ids";
import table from "../plant-layers.de.json";

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
  lastMeasurement: { date: "2026-10-01", value: 12.5, quality: "healthy", note: null },
  treatment: null,
  provenance: null,
  moreTreatments: 0,
  ...extra,
});

/** A part that is still loading for good: it suspends, as a lazy chunk on its way does (US-QS-14). */
function Pending(): ReactNode {
  throw new Promise<never>(() => undefined);
}

function show(slots: PlantSlots) {
  return render(
    <MemoryRouter initialEntries={["/start", "/?sheet=plant-e1"]} initialIndex={1}>
      <LayerHost>
        <PlantsScreen
          cards={[card()]}
          plants={pagesOf([card()])}
          summary={summaryOf([card()])}
          distribution={EMPTY_DISTRIBUTION.distribution}
          archived={[]}
          photoAccess={{ api: "http://api", token: async () => "tok" }}
          onSpeciesChoose={vi.fn()}
          onManage={vi.fn()}
          onRestore={vi.fn()}
          onArchivedCatchDate={vi.fn()}
          embedded
          slots={slots}
        />
      </LayerHost>
    </MemoryRouter>,
  );
}

describe("US-QS-32 the growth slot shows the fallback of its loaded height while its chunk loads (issue 2318)", () => {
  it("US-QS-32 the layer draws the growth fallback with its loading label while the part loads", async () => {
    setViewportWidth(360);
    show({
      growth: () => <Pending />,
      growthFallback: (label) => <p data-testid="growth-fallback">{label}</p>,
    });
    expect((await screen.findByTestId("growth-fallback")).textContent).toBe(table["slot.loading"]);
  });

  it("US-QS-23 the growth fallback gets the plant's card, so it can reserve the height of that plant's state (issue 2384)", async () => {
    setViewportWidth(360);
    show({
      growth: () => <Pending />,
      growthFallback: (label, plant) => (
        <p data-testid="growth-fallback">{`${label}|${plant.name}|${plant.lastMeasurement === null}`}</p>
      ),
    });
    expect((await screen.findByTestId("growth-fallback")).textContent).toBe(
      `${table["slot.loading"]}|Aloe|false`,
    );
  });

  it("US-QS-32 without a growth fallback the layer keeps its one-line shape for the growth part", async () => {
    setViewportWidth(360);
    show({ growth: () => <Pending /> });
    const status = await screen.findByRole("status");
    expect(status.querySelectorAll(".animate-pulse")).toHaveLength(1);
    expect(screen.queryByTestId("growth-fallback")).toBeNull();
  });
});

describe("US-QS-15 · SG-FEED-05 the water slot gets the place of its result under the quick actions (issues 2462, 2536)", () => {
  it("US-QS-15 · issue 2536 the slot's context holds the line under the row of the quick actions, in the part that stays in place, outside the scroll region", async () => {
    setViewportWidth(360);
    show({
      water: (_card, ctx) => (
        <>
          <button type="button">Gießen</button>
          {ctx.resultHost && createPortal(<p>Zuletzt gegossen: heute</p>, ctx.resultHost)}
        </>
      ),
    });
    const result = await screen.findByText("Zuletzt gegossen: heute");
    const row = screen.getByRole("group", { name: "Schnellaktionen" });
    const host = result.parentElement as HTMLElement;
    // Directly below the row, in the pinned part of the layer: the focus stays on the button, so nothing scrolls the content.
    expect(row.nextElementSibling).toBe(host);
    expect(host.closest("[data-sheet-pinned]")).not.toBeNull();
    expect(host.closest("[data-layer-body] > [data-scroll-region]")).toBeNull();
    expect(row.querySelector("p")).toBeNull();
    // The 'Art · Status' line of the overview stays as it is.
    expect(
      screen
        .getByText(/^Art: Aloe vera · Status: /)
        .closest("[data-layer-body] > [data-scroll-region]"),
    ).not.toBeNull();
  });
});
