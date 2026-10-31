// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CollectionArea } from "./components/routing/areas/collection-area/collection-area";
import { EMPTY_DISTRIBUTION } from "./collection/insights/distribution-test-helpers";
import { ToastProvider } from "./components/shared/states/toast/toast-provider/toast-provider";
import { AnnouncerProvider } from "./platform/announcer/announcer";
import "./collection/specimens/tests/plants-test-helpers";

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
      <ToastProvider>
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
      </ToastProvider>
    </MemoryRouter>,
  );

const pressed = (name: string | RegExp) =>
  screen.getByRole("button", { name }).getAttribute("aria-pressed") === "true";

beforeAll(async () => {
  await Promise.all([
    import("./collection/collection-page/collection-page"),
    import("./care/phases/care-phases-page/care-phases-page"),
    import("./light/light-page/light-page"),
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

const openView = async () =>
  userEvent.click(await screen.findByRole("button", { name: "Ansicht" }));

describe("US-QS-19 the first screen of the plants", () => {
  it("US-QS-19 holds the heading with the count, one row of modes, one insight row and a page of tiles", async () => {
    renderAt("/collection?view=plants");
    expect(await screen.findByText("4 Pflanzen")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Sammlung" })).toBeTruthy();
    expect(screen.getAllByRole("group", { name: "Ansicht der Sammlung" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Lichtzonen ansehen" })).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Pflanze 2 unbekannt unbekannt" })).toBeTruthy();
    // No grouping control, no distribution card and no plant card on the page itself.
    expect(screen.queryByRole("group", { name: "Gruppierung der Pflanzen" })).toBeNull();
    expect(screen.queryByText("Noch kein Foto")).toBeNull();
  });

  it("US-QS-19 · US-QS-22 the area asks the frame to fit one screen for every mode", async () => {
    const { container } = renderAt("/collection?view=plants");
    await screen.findByText("4 Pflanzen");
    expect(container.querySelector("[data-fit-screen]")).not.toBeNull();
    for (const mode of ["Arten", "Wünsche"]) {
      await userEvent.click(screen.getByRole("button", { name: mode }));
      await waitFor(() =>
        expect(screen.getByRole("button", { name: mode }).getAttribute("aria-pressed")).toBe(
          "true",
        ),
      );
      expect(container.querySelector("[data-fit-screen]")).not.toBeNull();
    }
  });
});

describe("US-QS-19 the plants can be grouped by care phase or by location", () => {
  it("US-QS-19 the plants show all by default; the layer Ansicht holds the grouping and the manage action", async () => {
    renderAt("/collection?view=plants");
    expect(await screen.findByText("4 Pflanzen")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Gruppierung der Pflanzen" })).toBeNull();
    await openView();
    expect(await screen.findByRole("dialog", { name: "Ansicht" })).toBeTruthy();
    expect(pressed("Alle")).toBe(true);
    expect(screen.getByRole("group", { name: "Gruppierung der Pflanzen" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Standorte und Lichtzonen verwalten" })).toBeTruthy();
    expect(screen.getByTestId("address").textContent).toBe("/collection?view=plants&sheet=view");
  });

  it("US-QS-19 · US-LIC-01 grouped by location the groups are a row of choices with their count; unknown values are named", async () => {
    renderAt("/collection?view=plants&group=location");
    const row = await screen.findByRole("group", { name: "Standort wählen" });
    expect(
      within(row)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["✓Flur (1)", "Wohnzimmer (2)", "Standort unbekannt (1)"]);
    expect(screen.getByText("Flur · Zone unbekannt · 1 Pflanze")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    await userEvent.click(within(row).getByRole("button", { name: /Wohnzimmer/ }));
    expect(screen.getByText("Wohnzimmer · Zone 2 · 2 Pflanzen")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByTestId("address").textContent).toBe(
      "/collection?view=plants&group=location&part=Wohnzimmer",
    );
    await userEvent.click(within(row).getByRole("button", { name: /Standort unbekannt/ }));
    expect(screen.getByText("Standort unbekannt · Zone unbekannt · 1 Pflanze")).toBeTruthy();
    await openView();
    expect(pressed("Nach Standort")).toBe(true);
  });

  it("US-QS-19 · US-PHA-01 grouped by care phase the phase of the plants shows with its count line", async () => {
    renderAt("/collection?view=plants&group=phase");
    expect(await screen.findByText("Soll-Phase heute: Ruhephase")).toBeTruthy();
    expect(await screen.findByText("1 Pflanze mit Pflegephase")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ruhephase (1)" })).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    // US-QS-19: compact card, one line of facts and one line of places in the paged grouping.
    expect(screen.getByText(/^Standort: .* · Soll-Standort: /)).toBeTruthy();
    await openView();
    expect(pressed("Nach Pflegephase")).toBe(true);
  });

  it("US-QS-19 choosing a grouping changes the address, starts at page 1, returns the focus to Ansicht and announces it", async () => {
    renderAt("/collection?view=plants&page=2");
    await screen.findByText("4 Pflanzen");
    await openView();
    await userEvent.click(screen.getByRole("button", { name: "Nach Standort" }));
    expect(screen.getByTestId("address").textContent).toBe(
      "/collection?view=plants&group=location",
    );
    expect(document.querySelector("[aria-live=polite]")?.textContent).toContain("Nach Standort");
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Ansicht" })),
    );
    await openView();
    await userEvent.click(screen.getByRole("button", { name: "Alle" }));
    expect(screen.getByTestId("address").textContent).toBe("/collection?view=plants");
  });

  it("US-QS-19 an unknown group in the address shows all plants; the species mode has no Ansicht", async () => {
    renderAt("/collection?view=plants&group=unsinn");
    expect(await screen.findByText("4 Pflanzen")).toBeTruthy();
    await openView();
    expect(pressed("Alle")).toBe(true);
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Arten" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Ansicht" })).toBeNull());
  });
});

describe("US-QS-19 Standorte und Lichtzonen verwalten opens the management in the plants", () => {
  it("US-QS-19 · US-LIC-01 the action opens the management with a way back that keeps the grouping", async () => {
    renderAt("/collection?view=plants&group=location");
    await openView();
    await userEvent.click(
      await screen.findByRole("button", { name: "Standorte und Lichtzonen verwalten" }),
    );
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

describe("US-QS-19 the layer Ansicht follows the layer rules", () => {
  it("US-QS-19 · DS-40 Escape closes the layer and the focus returns to Ansicht", async () => {
    renderAt("/collection?view=plants");
    await screen.findByText("4 Pflanzen");
    const opener = screen.getByRole("button", { name: "Ansicht" });
    opener.focus();
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByRole("dialog", { name: "Ansicht" })).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Ansicht" })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
});

describe("US-QS-14 · US-LIC-01 the locations view is a sub-page with one page header", () => {
  it("US-QS-14 has exactly one h1 in its failing state too, and its back control sits in that page header", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        response(500, { error: { code: "server.error", text: "Der Server antwortet nicht." } }),
      ),
    );
    renderAt("/collection?view=plants&manage=locations");
    await screen.findByRole("button", { name: "Erneut versuchen" });
    const title = screen.getByRole("heading", { level: 1 });
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const header = title.closest("[data-page-header]") as HTMLElement | null;
    expect(header).not.toBeNull();
    expect(
      within(header as HTMLElement).getByRole("button", { name: "Zurück zur Sammlung" }),
    ).toBeTruthy();
  });
});
