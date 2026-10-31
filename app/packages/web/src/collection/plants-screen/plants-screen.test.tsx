// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Distribution, SpecimenCard } from "@pflanzendex/core";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CollectionPage } from "../collection-page/collection-page";
import { EMPTY_DISTRIBUTION } from "../insights/distribution-test-helpers";
import { openPlant } from "../specimens/tests/plants-test-helpers";
import { PlantsScreen } from "./plants-screen";

const card = (id: number, extra: Partial<SpecimenCard> = {}): SpecimenCard => ({
  id: `e${id}`,
  name: `Pflanze ${id}`,
  speciesId: "a1",
  marker: null,
  speciesName: "Bogenhanf",
  status: "plant",
  location: "Regal Süd",
  lightZone: "Zone 3",
  lightZoneSource: "location",
  caughtAt: "2026-09-01",
  photo: null,
  lastMeasurement: null,
  treatment: null,
  provenance: null,
  moreTreatments: 0,
  ...extra,
});

const zone = (n: number) => ({ id: `z${n}`, name: `Zone ${n}`, rank: n });
const distribution: Distribution = {
  zones: [
    { zone: zone(2), count: 3 },
    { zone: zone(3), count: 1 },
  ],
  thinnest: [zone(3)],
  notCounted: { cuttingLight: 0, archived: 0, zoneUnknown: 0 },
  hint: {
    text: "Zone 3 ist am dünnsten besetzt.",
    nextAction: "Setze eine Art auf die Wunschliste.",
  },
} as unknown as Distribution;

function Where() {
  const { search } = useLocation();
  return <span data-testid="address">{search}</span>;
}

type Extra = Partial<Parameters<typeof PlantsScreen>[0]>;
const screenWith = (cards: SpecimenCard[], extra: Extra = {}, at = "/") =>
  render(
    <MemoryRouter initialEntries={[at]}>
      <PlantsScreen
        cards={cards}
        distribution={distribution}
        archived={[]}
        photoAccess={{ api: "http://api", token: async () => "tok" }}
        onSpeciesChoose={vi.fn()}
        onManage={vi.fn()}
        onRestore={vi.fn()}
        onArchivedCatchDate={vi.fn()}
        embedded
        {...extra}
      />
      <Where />
    </MemoryRouter>,
  );

const many = (n: number) => Array.from({ length: n }, (_, i) => card(i + 1));

afterEach(cleanup);

describe("US-QS-19 tiles of the plants", () => {
  it("US-QS-08 · WCAG 2.5.3 the plant tile's accessible name is its visible text (no aria-label, no decorative glyph in the text)", () => {
    screenWith([card(1, { name: "Aloe" })]);
    const tile = screen.getByRole("button", { name: /^Aloe/ });
    expect(tile.hasAttribute("aria-label")).toBe(false);
    expect(tile.querySelector("[data-initial]")?.textContent).toBe("");
  });

  it("US-QS-19 a tile shows the initial of the name, the name, the zone as text and one state", () => {
    screenWith([card(1, { name: "Aloe" })]);
    const tile = screen.getByRole("button", { name: "Aloe Zone 3 unbekannt" });
    expect(tile.querySelector("[data-initial]")?.getAttribute("data-initial")).toBe("A");
    expect(within(tile).getByText("Aloe")).toBeTruthy();
    expect(within(tile).getByText("Zone 3")).toBeTruthy();
    expect(within(tile).getByText("unbekannt")).toBeTruthy();
  });

  it("US-QS-19 · P-08 an unknown zone and an unknown state read unbekannt, nothing is invented", () => {
    screenWith([card(1, { lightZone: null, lightZoneSource: null })]);
    const tile = screen.getByRole("button", { name: "Pflanze 1 unbekannt unbekannt" });
    expect(within(tile).getAllByText("unbekannt")).toHaveLength(2);
  });

  it("US-QS-19 the state is Behandeln for an open treatment, Vergeilt/dünn or Gesund by the last measurement", () => {
    const treatment = {
      reason: "Neem",
      dueDate: { kind: "soon" as const, days: 2, text: "in 2 Tg." },
    };
    const measured = (quality: "healthy" | "etiolated") => ({
      date: "2026-10-01",
      value: 12,
      quality,
      note: null,
    });
    screenWith([
      card(1, { treatment, lastMeasurement: measured("healthy") }),
      card(2, { lastMeasurement: measured("etiolated") }),
      card(3, { lastMeasurement: measured("healthy") }),
    ]);
    expect(screen.getByRole("button", { name: "Pflanze 1 Zone 3 Behandeln" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pflanze 2 Zone 3 Vergeilt/dünn" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pflanze 3 Zone 3 Gesund" })).toBeTruthy();
  });

  it("US-QS-19 the plants are paged, the page is in the address and a page out of range shows the nearest", async () => {
    screenWith(many(8));
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
    expect(screen.getByText("Seite 1 von 2")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
    expect(screen.getByTestId("address").textContent).toBe("?page=2");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /^Pflanze 7 / })).toBeTruthy();
    cleanup();
    screenWith(many(8), {}, "/?page=9");
    expect(screen.getByText("Seite 2 von 2")).toBeTruthy();
  });

  it("US-QS-19 a swipe turns the page", () => {
    screenWith(many(8));
    const list = screen.getByRole("list", { name: "Pflanzen" });
    fireEvent.pointerDown(list, { clientX: 200, clientY: 10 });
    fireEvent.pointerUp(list, { clientX: 100, clientY: 10 });
    expect(screen.getByText("Seite 2 von 2")).toBeTruthy();
  });
});

describe("US-QS-19 page size fills the free height of the region (tiles)", () => {
  // jsdom has no layout: the list region and its tiles get a height (a tile is 100 px, the list has no gap in jsdom).
  let region = 0;
  beforeEach(() => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
      this: Element,
    ) {
      const height = this.tagName === "UL" ? region : this.tagName === "LI" ? 100 : 0;
      return { height, width: 0, top: 0, left: 0, right: 0, bottom: height, x: 0, y: 0 } as DOMRect;
    });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("US-QS-19 the tiles fill the free height of the region: whole rows per page, the pager below", () => {
    region = 532;
    screenWith(many(8));
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByText("Seite 1 von 2")).toBeTruthy();
  });
});

describe("US-QS-19 the layers of the plants", () => {
  it("US-QS-19 the insight row names the thinnest zone and opens the layer with the distribution and the way to the management", async () => {
    const onManage = vi.fn();
    screenWith(many(2), { onManage });
    await userEvent.click(screen.getByRole("button", { name: /Dünnste Zone: Zone 3/ }));
    const layer = await screen.findByRole("dialog", { name: "Lichtzonen" });
    expect(screen.getByTestId("address").textContent).toBe("?sheet=zones");
    expect(within(layer).getByText(/Zone 3: 1 Pflanze/)).toBeTruthy();
    expect(within(layer).getByText(/dünnste Zone/)).toBeTruthy();
    expect(within(layer).getByText(/Stecklingslicht zählt nicht/)).toBeTruthy();
    await userEvent.click(
      within(layer).getByRole("button", { name: "Standorte und Lichtzonen verwalten" }),
    );
    expect(onManage).toHaveBeenCalledOnce();
  });

  it("US-QS-19 choosing a tile opens the plant as a layer, addressed by ?sheet=plant-<id>, with the same actions", async () => {
    const onMeasure = vi.fn();
    screenWith([card(1, { name: "Aloe" })], { onMeasure });
    await openPlant("Aloe");
    const layer = await screen.findByRole("dialog", { name: "Aloe" });
    expect(screen.getByTestId("address").textContent).toBe("?sheet=plant-e1");
    expect(within(layer).getByText("Art: Bogenhanf · Status: Pflanze")).toBeTruthy();
    await userEvent.click(within(layer).getByRole("button", { name: "Messen: Aloe" }));
    expect(onMeasure).toHaveBeenCalledOnce();
  });

  it("US-QS-19 · P-10 archived plants stay reachable through the archive layer", async () => {
    const archived = [
      {
        id: "x1",
        name: "Alter Ficus",
        speciesName: "Birkenfeige",
        caughtAt: null,
        archivedAt: "2026-10-02",
        archivedReason: "eingegangen",
      },
    ];
    screenWith(many(1), { archived });
    await userEvent.click(screen.getByRole("button", { name: "Archiv (1)" }));
    const layer = await screen.findByRole("dialog", { name: "Archiv" });
    expect(within(layer).getByText("Alter Ficus")).toBeTruthy();
  });

  it("US-QS-19 · P-09 without a plant the mode says what to do next", () => {
    const onSpeciesChoose = vi.fn();
    screenWith([], { onSpeciesChoose });
    expect(screen.getByText("Du hast noch keine Pflanze.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Art wählen" }));
    expect(onSpeciesChoose).toHaveBeenCalledOnce();
  });
});

describe("US-QS-19 loading and error states of the plants", () => {
  const fail = () =>
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        Response.json(
          { error: { code: "server.error", text: "Der Server antwortet nicht." } },
          { status: 500 },
        ),
      ),
    );
  const page = () => (
    <MemoryRouter>
      <CollectionPage
        api="http://api"
        token={async () => "tok"}
        newSpecies={null}
        onSpeciesChoose={vi.fn()}
        onCompleted={vi.fn()}
      />
    </MemoryRouter>
  );

  it("US-QS-19 · P-10 while loading a skeleton says so, and an error offers Erneut versuchen", async () => {
    fail();
    render(page());
    expect(screen.getByRole("status").textContent).toContain("Sammlung wird geladen");
    expect((await screen.findByRole("alert")).textContent).toContain("Der Server antwortet nicht.");
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it("US-QS-19 the page of the plants loads with the empty distribution of a new account", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url) => {
        const path = new URL(String(url)).pathname;
        if (path === "/locations") return Response.json({ locations: [] });
        if (path === "/specimens/archived") return Response.json({ archived: [] });
        if (path === "/specimens/distribution") return Response.json(EMPTY_DISTRIBUTION);
        return Response.json({ cards: [] });
      }),
    );
    render(page());
    expect(await screen.findByText("Du hast noch keine Pflanze.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lichtzonen ansehen" })).toBeTruthy();
    vi.unstubAllGlobals();
  });
});
