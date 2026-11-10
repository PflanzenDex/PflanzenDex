// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import type { SpecimenCard } from "@pflanzendex/core";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
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
    const status = await screen.findByRole("status");
    expect(status.textContent).toBe("Pflegeprofil wird geladen …");
    expect(status.querySelectorAll(".animate-pulse").length).toBeGreaterThan(3);
    await act(async () => gate.release());
    expect(await screen.findByText("Pflegeprofil-Inhalt")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
