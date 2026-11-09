// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../../shared/data";
import { CarePhasesPage } from "../../phases/care-phases-page/care-phases-page";
import { PhaseOfPlant } from "./plant-phase";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const phase = {
  specimenId: "e1",
  name: "Bogenhanf",
  speciesId: "a1",
  phase: "dormancy",
  locationId: "s1",
  targetLocationId: null,
  nextChange: { date: "2027-03-16", phase: "growth", days: 120 },
};
const location = { id: "s1", name: "Regal Süd", lightZoneId: null, kind: "indoor" };
const token = async () => "tok";

/** Fake server per path: the network is the only foreign system, the components run for real. */
function fakeServer(routes: Record<string, () => Promise<Response>>) {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url) => {
      const path = new URL(String(url)).pathname;
      return (routes[path] ?? (() => response(404, {})))();
    }),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-PHA-01 the phase of a plant and the grouping share the query cache", () => {
  it("US-PHA-01 the grouping opens with its own copy after a plant's phase was read (no shape clash)", async () => {
    fakeServer({
      "/care-phases": () => response(200, { phases: [phase] }),
      "/locations": () => response(200, { locations: [location] }),
    });
    // One client for the whole app: the plant's "Pflegephase" part caches a single row, the grouping caches its rows.
    const client = createQueryClient();
    const plant = render(
      <QueryClientProvider client={client}>
        <PhaseOfPlant api="http://api" token={token} specimenId="e1" />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Soll-Phase heute: Ruhephase")).toBeTruthy();
    plant.unmount();

    render(
      <QueryClientProvider client={client}>
        <CarePhasesPage api="http://api" token={token} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Bogenhanf")).toBeTruthy();
    expect(screen.queryByText("Die Seite konnte nicht geladen werden.")).toBeNull();
  });
});
