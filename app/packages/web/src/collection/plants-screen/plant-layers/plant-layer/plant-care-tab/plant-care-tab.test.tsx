// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import type { SpecimenCard } from "@pflanzendex/core";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { LayerHost } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { CareProfileLayer } from "./plant-care-tab";

// The own care profile loads as a lazy part: until `gate.release` runs, it suspends like a chunk that is still on its way.
const gate = vi.hoisted(() => {
  const state: { done: boolean; ready: Promise<void>; release: () => void } = {
    done: false,
    ready: Promise.resolve(),
    release: () => undefined,
  };
  state.ready = new Promise<void>((resolve) => {
    state.release = () => {
      state.done = true;
      resolve();
    };
  });
  return state;
});

vi.mock("../../../../care-profile-page/care-profile-page", () => ({
  CareProfileSection: () => {
    if (!gate.done) throw gate.ready;
    return <p>Pflegeprofil-Inhalt</p>;
  },
}));

// Both lazy parts of the layer are loaded before the test (#444, the pattern of collection-area.test.tsx). At this width
// the layer is a sheet, and the sheet's own chunk shows the status "Fenster wird geladen …" while it loads, so without
// this the first status on screen could be the sheet's (issue 2136).
beforeAll(async () => {
  await Promise.all([
    import("@/shared/ui/sheet.panel"),
    import("../../../../care-profile-page/care-profile-page"),
  ]);
}, 30_000);

afterEach(cleanup);

const card = (): SpecimenCard => ({
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
});

describe("US-QS-14 issue 1784 · the care profile layer shows the shape of the profile while it loads", () => {
  it("US-QS-14 issue 1784 · the layer shows the profile's shape after the delay, not a bare status text, then the profile", async () => {
    setViewportWidth(360);
    render(
      <MemoryRouter initialEntries={["/", "/?sheet=profil-e1"]} initialIndex={1}>
        <LayerHost>
          <CareProfileLayer
            card={card()}
            access={{ api: "http://api", token: async () => "tok" }}
          />
        </LayerHost>
      </MemoryRouter>,
    );
    expect(screen.queryByRole("status")).toBeNull();
    // The profile's status is found by its own text: a status of another lazy part must not stand in for it.
    const label = await screen.findByText("Pflegeprofil wird geladen …");
    const status = label.closest<HTMLElement>('[role="status"]');
    expect(status).not.toBeNull();
    const shape = status as HTMLElement;
    expect(shape.textContent).toBe("Pflegeprofil wird geladen …");
    expect(shape.querySelectorAll(".animate-pulse").length).toBeGreaterThan(3);
    // The profile's status is the only one on screen, as the first status was before this wait by text.
    expect(screen.getAllByRole("status")).toEqual([shape]);
    await act(async () => gate.release());
    expect(await screen.findByText("Pflegeprofil-Inhalt")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
