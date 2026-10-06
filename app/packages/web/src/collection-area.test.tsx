// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CollectionArea } from "./collection-area";
import { EMPTY_DISTRIBUTION } from "./collection/distribution-test-helpers";

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
};

// Both pages are lazy chunks (DS-08). Loading them first makes the waits below depend on the data only, not on how
// long the first import of a chunk takes on a busy machine (#444).
beforeAll(async () => {
  await Promise.all([import("./collection/CollectionPage"), import("./care/MeasurePage")]);
}, 30_000);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-WAC-01 collection wired with measuring", () => {
  it("US-WAC-01 measuring on the specimen opens the measure view, back leads to the collection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url) => {
        const path = new URL(String(url)).pathname;
        if (path === "/locations") return response(200, { locations: [] });
        if (path === "/specimens/archived") return response(200, { archived: [] });
        if (path === "/specimens/distribution") return response(200, EMPTY_DISTRIBUTION);
        if (path === "/specimens/e1/measurements") return response(200, emptyView);
        return response(200, { cards: [card] });
      }),
    );
    render(
      <CollectionArea
        api="http://api"
        token={async () => "tok"}
        newSpecies={null}
        onSpeciesChoose={() => {}}
        onCompleted={() => {}}
      />,
    );
    // The collection page is a lazy part; its first import can take longer than the default second under load.
    const measure = await screen.findByRole(
      "button",
      { name: "Messen: Bogenhanf" },
      { timeout: 5_000 },
    );
    await userEvent.click(measure);
    expect(await screen.findByRole("heading", { name: "Messen: Bogenhanf" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Zurück zum Bestand" }));
    expect(await screen.findByRole("heading", { name: "Bestand" })).toBeTruthy();
  });
});
