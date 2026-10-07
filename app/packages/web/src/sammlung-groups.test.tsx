// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CollectionArea } from "./collection-area";
import { EMPTY_DISTRIBUTION } from "./collection/distribution-test-helpers";
import { AnnouncerProvider } from "./platform/announcer/announcer";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const card = (id: string, location: string | null, lightZone: string | null) => ({
  id,
  name: `Pflanze ${id}`,
  speciesName: "Bogenhanf",
  status: "plant",
  location,
  lightZone,
  caughtAt: "2026-10-03",
  photo: null,
  lastMeasurement: null,
  treatment: null,
  moreTreatments: 0,
});
const cards = [
  card("1", "Wohnzimmer", "Zone 2"),
  card("2", "Flur", null),
  card("3", "Wohnzimmer", "Zone 2"),
  card("4", null, null),
];
const phase = {
  specimenId: "e1",
  name: "Bogenhanf",
  speciesId: "a1",
  phase: "dormancy",
  locationId: "s1",
  targetLocationId: null,
  nextChange: { date: "2027-03-16", phase: "growth", days: 120 },
};

function stubServer() {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url) => {
      const path = new URL(String(url)).pathname;
      if (path === "/locations")
        return response(200, {
          locations: [{ id: "s1", name: "Regal Süd", lightZoneId: null, kind: "indoor" }],
        });
      if (path === "/specimens/archived") return response(200, { archived: [] });
      if (path === "/specimens/distribution") return response(200, EMPTY_DISTRIBUTION);
      if (path === "/specimens/cards") return response(200, { cards });
      if (path === "/care-phases") return response(200, { phases: [phase] });
      if (path === "/light-zones") return response(200, { zones: [] });
      if (path === "/hints") return response(200, { hints: [] });
      if (path === "/specimens/light-overview") return response(200, { rows: [] });
      return response(200, {});
    }),
  );
}

function Probe() {
  const l = useLocation();
  return <p data-testid="address">{l.pathname + l.search}</p>;
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AnnouncerProvider>
        <CollectionArea
          api="http://api"
          token={async () => "tok"}
          newSpecies={null}
          onSpeciesChoose={() => {}}
          onCompleted={() => {}}
        />
        <Probe />
      </AnnouncerProvider>
    </MemoryRouter>,
  );

const pressed = (name: string | RegExp) =>
  screen.getByRole("button", { name }).getAttribute("aria-pressed") === "true";

beforeAll(async () => {
  await Promise.all([
    import("./collection/CollectionPage"),
    import("./care/CarePhasesPage"),
    import("./light/LightPage"),
  ]);
}, 30_000);

beforeEach(() => {
  window.localStorage.clear();
  stubServer();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-QS-14 the plants can be grouped by care phase or by location", () => {
  it("US-QS-14 the plants show all by default, with the grouping control and the manage action", async () => {
    renderAt("/collection?view=plants");
    expect(await screen.findByText("4 Pflanzen")).toBeTruthy();
    expect(pressed("Alle")).toBe(true);
    expect(screen.getByRole("group", { name: "Gruppierung der Pflanzen" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Standorte verwalten" })).toBeTruthy();
  });

  it("US-QS-14 · US-LIC-01 grouped by location the plants sit below their location and zone; unknown values are named", async () => {
    renderAt("/collection?view=plants&group=location");
    expect(
      await screen.findByRole("heading", { name: "Flur · Zone unbekannt · 1 Pflanze" }),
    ).toBeTruthy();
    const wohnzimmer = screen.getByRole("heading", { name: "Wohnzimmer · Zone 2 · 2 Pflanzen" });
    expect(
      within(wohnzimmer.closest("section") as HTMLElement).getAllByRole("listitem"),
    ).toHaveLength(2);
    expect(
      screen.getByRole("heading", { name: "Standort unbekannt · Zone unbekannt · 1 Pflanze" }),
    ).toBeTruthy();
    expect(pressed("Nach Standort")).toBe(true);
  });

  it("US-QS-14 · US-PHA-01 grouped by care phase the phases of the plants show with their count line", async () => {
    renderAt("/collection?view=plants&group=phase");
    expect(await screen.findByText("Soll-Phase heute: Ruhephase")).toBeTruthy();
    expect(await screen.findByText("1 Pflanze mit Pflegephase")).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(pressed("Nach Pflegephase")).toBe(true);
  });

  it("US-QS-14 choosing a grouping changes the address, keeps the focus on the control and announces it", async () => {
    renderAt("/collection?view=plants");
    await screen.findByText("4 Pflanzen");
    await userEvent.click(screen.getByRole("button", { name: "Nach Standort" }));
    expect(screen.getByTestId("address").textContent).toBe(
      "/collection?view=plants&group=location",
    );
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Nach Standort" }));
    expect(document.querySelector("[aria-live=polite]")?.textContent).toContain("Nach Standort");
    await userEvent.click(screen.getByRole("button", { name: "Alle" }));
    expect(screen.getByTestId("address").textContent).toBe("/collection?view=plants");
  });

  it("US-QS-14 an unknown group in the address shows all plants; the species mode has no plant controls", async () => {
    renderAt("/collection?view=plants&group=unsinn");
    expect(await screen.findByText("4 Pflanzen")).toBeTruthy();
    expect(pressed("Alle")).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Arten" }));
    await waitFor(() =>
      expect(screen.queryByRole("group", { name: "Gruppierung der Pflanzen" })).toBeNull(),
    );
    expect(screen.queryByRole("button", { name: "Standorte verwalten" })).toBeNull();
  });
});

describe("US-QS-14 Standorte verwalten opens the locations and light zones in the plants", () => {
  it("US-QS-14 · US-LIC-01 the action opens the management with a way back that keeps the grouping", async () => {
    renderAt("/collection?view=plants&group=location");
    await userEvent.click(await screen.findByRole("button", { name: "Standorte verwalten" }));
    expect(await screen.findByRole("heading", { name: "Standorte" })).toBeTruthy();
    expect(screen.getByTestId("address").textContent).toBe(
      "/collection?view=plants&group=location&manage=locations",
    );
    expect(screen.queryByRole("heading", { level: 1, name: "Sammlung" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Zurück zur Sammlung" }));
    expect(screen.getByTestId("address").textContent).toBe(
      "/collection?view=plants&group=location",
    );
    expect(await screen.findByRole("heading", { level: 1, name: "Sammlung" })).toBeTruthy();
  });

  it("US-QS-14 · US-LIC-01 an address with manage=locations opens the management at once; its error state offers a retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        response(500, { error: { code: "server.error", text: "Der Server antwortet nicht." } }),
      ),
    );
    renderAt("/collection?view=plants&manage=locations");
    expect(await screen.findByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Zurück zur Sammlung" })).toBeTruthy();
  });
});
