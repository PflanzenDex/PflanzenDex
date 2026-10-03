// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
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
    await userEvent.click(await screen.findByRole("button", { name: "Messen: Bogenhanf" }));
    expect(await screen.findByRole("heading", { name: "Messen: Bogenhanf" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Zurück zum Bestand" }));
    expect(await screen.findByRole("heading", { name: "Bestand" })).toBeTruthy();
  });
});
