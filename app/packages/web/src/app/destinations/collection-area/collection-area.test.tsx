// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { findCardButton } from "../../../collection/specimens/tests/plants-test-helpers";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CollectionArea } from "./collection-area";
import { EMPTY_DISTRIBUTION } from "../../../collection/insights/distribution-test-helpers";
import { answerCardRead } from "../../../collection/specimens/tests/cards-fake";
import type { SpecimenCard } from "@pflanzendex/core";
import { FeaturesProvider } from "@/shared/data";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const card = {
  id: "e1",
  name: "Bogenhanf",
  speciesName: "Bogenhanf",
  status: "plant",
  location: null,
  lightZone: null,
  caughtAt: "2026-10-03",
  photo: null,
  lastMeasurement: null,
  treatment: null,
  moreTreatments: 0,
};
const emptyView = {
  specimenId: "e1",
  growthMeasure: null,
  measurements: [],
  last: null,
  lastRating: null,
  growth: { count: 0, ratePerYear: null, trend: null, signal: null },
};

// Both pages are lazy chunks (DS-08). Loading them first makes the waits below depend on the data only, not on how
// long the first import of a chunk takes on a busy machine (#444).
beforeAll(async () => {
  await Promise.all([
    import("../../../collection/collection-page/collection-page"),
    import("../../../care/measure/measure-page/measure-page"),
  ]);
}, 30_000);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** The API of one plant (Bogenhanf) with its measurements, locations and archive. */
function stubCollection() {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url) => {
      const path = new URL(String(url)).pathname;
      if (path === "/locations") return response(200, { locations: [] });
      if (path === "/specimens/archived") return response(200, { archived: [] });
      if (path === "/specimens/distribution") return response(200, EMPTY_DISTRIBUTION);
      if (path === "/specimens/e1/measurements") return response(200, emptyView);
      return answerCardRead(new URL(String(url)), [card as SpecimenCard]) ?? response(404, {});
    }),
  );
}

function renderArea() {
  render(
    <MemoryRouter>
      <CollectionArea
        api="http://api"
        token={async () => "tok"}
        newSpecies={null}
        onSpeciesChoose={() => {}}
        onCompleted={() => {}}
      />
    </MemoryRouter>,
  );
}

describe("US-WAC-01 collection wired with measuring", () => {
  it("US-WAC-01 measuring on the specimen opens the measure view, back leads to the collection", async () => {
    stubCollection();
    renderArea();
    // The collection page is a lazy part; its first import can take longer than the default second under load.
    await screen.findByRole("button", { name: /^Bogenhanf / }, { timeout: 5_000 });
    await userEvent.click(await findCardButton("Messen: Bogenhanf"));
    expect(await screen.findByRole("heading", { name: "Messen: Bogenhanf" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Zurück zur Sammlung" }));
    expect(await screen.findByRole("heading", { name: "Sammlung" })).toBeTruthy();
  });
});

describe("US-QS-15 every mode of the area is one screen (DS-61)", () => {
  it("US-QS-15 the measure view sits in the frame of the area, so at a large text size its content scrolls inside it", async () => {
    stubCollection();
    renderArea();
    await screen.findByRole("button", { name: /^Bogenhanf / }, { timeout: 5_000 });
    await userEvent.click(await findCardButton("Messen: Bogenhanf"));
    const heading = await screen.findByRole("heading", { name: "Messen: Bogenhanf" });
    expect(heading.closest("[data-fit-screen]")).not.toBeNull();
  });

  it("US-QS-15 a form of a plant (the marker) sits in the frame of the area too", async () => {
    stubCollection();
    renderArea();
    await screen.findByRole("button", { name: /^Bogenhanf / }, { timeout: 5_000 });
    await userEvent.click(await findCardButton("Kennzeichen ändern: Bogenhanf"));
    const heading = await screen.findByRole("heading", { name: "Kennzeichen ändern" });
    expect(heading.closest("[data-fit-screen]")).not.toBeNull();
  });
});

describe("US-ONB-09 the keeper's switches in the Sammlung", () => {
  it("US-ONB-09 a switched-off wishlist is not offered in the switch, and its address falls back to the plants", async () => {
    stubCollection();
    render(
      <MemoryRouter initialEntries={["/collection?view=wishlist"]}>
        <FeaturesProvider
          features={{
            social: true,
            ai: true,
            recommendations: true,
            wishlist: false,
            equipment: true,
          }}
        >
          <CollectionArea
            api="http://api"
            token={async () => "tok"}
            newSpecies={null}
            onSpeciesChoose={() => {}}
            onCompleted={() => {}}
          />
        </FeaturesProvider>
      </MemoryRouter>,
    );
    await screen.findByRole("button", { name: /^Bogenhanf / }, { timeout: 5_000 });
    const switchGroup = screen.getByRole("group", { name: "Ansicht der Sammlung" });
    expect(within(switchGroup).queryByText("Wünsche")).toBeNull();
    expect(within(switchGroup).getByText("Geräte")).toBeTruthy();
  });
});
