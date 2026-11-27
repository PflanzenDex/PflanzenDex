// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Distribution, SpecimenCard } from "@pflanzendex/core";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CollectionPage } from "../collection-page/collection-page";
import { EMPTY_DISTRIBUTION } from "../insights/distribution-test-helpers";
import { openPlant, pagesOf, summaryOf } from "../specimens/tests/plants-test-helpers";
import { answerCardRead } from "../specimens/tests/cards-fake";
import { endSheetExit, holdSheetExit, releaseSheetExits } from "@/shared/testing/sheet-exit";
import { PlantsScreen } from "./plants-screen";
import { delayLoads } from "@/shared/ui/skeleton.loading-contract";
import { setViewportWidth } from "@/shared/testing/viewport-mock";

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
  lightNeedUnknown: false,
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
  lightNeedUnknown: [],
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
        plants={pagesOf(cards)}
        summary={summaryOf(cards)}
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
afterEach(releaseSheetExits);
afterEach(() => setViewportWidth(360));

/** The rows of the plant list ("Pflanzen"); the light-zone row above it is a list item of its own (F-0114). */
const plantItems = () =>
  within(screen.getByRole("list", { name: "Pflanzen" })).getAllByRole("listitem");

describe("US-QS-19 tiles of the plants", () => {
  it("US-QS-08 · WCAG 2.5.3 the plant row's accessible name is its visible title (no aria-label, no decorative glyph in the text)", () => {
    screenWith([card(1, { name: "Aloe" })]);
    const tile = screen.getByRole("button", { name: /^Aloe(\s|$)/ });
    expect(tile.hasAttribute("aria-label")).toBe(false);
    expect(tile.querySelector("[data-initial]")).toBeNull();
    expect(tile.querySelector('[class~="size-[56px]"] svg')).not.toBeNull();
  });

  it("US-QS-32 a plant row shows the drawn placeholder, its name, its zone as text and no state that needs no attention", () => {
    screenWith([card(1, { name: "Aloe" })]);
    const tile = screen.getByRole("button", { name: /^Aloe(\s|$)/ });
    expect(tile.querySelector('[class~="size-[56px]"] svg')).not.toBeNull();
    expect(within(tile).getByText("Aloe")).toBeTruthy();
    expect(within(tile).getByText("Zone 3")).toBeTruthy();
    expect(within(tile).queryByText("unbekannt")).toBeNull();
  });

  it("US-QS-19 · P-08 an unknown zone reads 'Lichtzone unbekannt', so no bare unbekannt stands in the row (owner answer Q08)", () => {
    screenWith([card(1, { lightZone: null, lightZoneSource: null })]);
    const tile = screen.getByRole("button", { name: /^Pflanze 1(\s|$)/ });
    expect(within(tile).getByText("Lichtzone unbekannt")).toBeTruthy();
    expect(within(tile).queryByText("unbekannt")).toBeNull();
  });

  it("US-QS-19 the attention of a row is Behandeln for an open treatment or Vergeilt/dünn by the last measurement; a healthy plant shows none (SG-COLOR-04)", () => {
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
    expect(
      within(screen.getByRole("button", { name: /^Pflanze 1(\s|$)/ })).getByText("Behandeln"),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("button", { name: /^Pflanze 2(\s|$)/ })).getByText("Vergeilt/dünn"),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("button", { name: /^Pflanze 3(\s|$)/ })).queryByText("Gesund"),
    ).toBeNull();
  });

  it("US-QS-15 · SG-LIST-01 the plants are one scrolling list at every width: every card, no pages, no position in the address", () => {
    for (const width of [360, 768, 1024, 1920]) {
      setViewportWidth(width);
      screenWith(many(20));
      expect(plantItems()).toHaveLength(20);
      expect(screen.queryByRole("button", { name: /^(Zurück|Weiter)$/ })).toBeNull();
      expect(screen.queryByText(/^Seite \d+ von \d+$/)).toBeNull();
      expect(screen.getByTestId("address").textContent).toBe("");
      cleanup();
    }
  });

  it("US-QS-15 · SG-NAV-02 an old position in the address (?from=21) is dropped and the list starts at its first plant", async () => {
    screenWith(many(20), {}, "/?from=21");
    expect(plantItems()).toHaveLength(20);
    await waitFor(() => expect(screen.getByTestId("address").textContent).toBe(""));
    expect(screen.getByRole("button", { name: /^Pflanze 1(\s|$)/ })).toBeTruthy();
  });

  it("US-QS-32 the plant rows are one flat group in one column at every width: no grid, no gap, no box per row (SG-SHAPE-03, FX-35)", () => {
    screenWith(many(8));
    const items = plantItems();
    const group = items[0]?.parentElement;
    expect(group?.className).toContain("flex-col");
    // The list is transparent and stretches (flex-1 of the fitting list, issue 1413); the card is on each row.
    expect(group?.className.split(" ")).not.toContain("bg-card");
    expect(group?.className).toContain("flex-1");
    expect(group?.className).toContain("[&>li]:bg-card");
    expect(group?.className).toContain("[&>li:first-child]:rounded-t-card");
    expect(group?.className).toContain("gap-0");
    expect(group?.className).not.toMatch(/\bgrid\b|grid-cols|shadow/);
    // The rows of the group are separated by a hairline between two rows (never above the first one), inset to the text.
    expect(group?.className).toContain("[&>li+li]:before:h-px");
    expect(group?.className).toContain("[&>li+li]:before:left-[72px]");
  });

  it("US-QS-32 a plant row draws no box of its own: no border and no radius, the group is the only frame (FX-35)", () => {
    screenWith([card(1, { name: "Aloe" })]);
    const row = screen.getByRole("button", { name: /^Aloe(\s|$)/ });
    const surface = row.closest("li")?.firstElementChild;
    expect(surface?.className).not.toMatch(/\bborder-border\b|\brounded-lg\b|\bbg-card\b/);
  });

  it("US-QS-32 the light-zone row is a row of its own above the plants: a chevron, at least 44 px high, and the plants take the room that is left (F-0114, US-QS-15)", () => {
    screenWith(many(8));
    const insight = screen.getByRole("button", { name: /^Lichtzonen/ });
    expect(insight.querySelector("svg")).not.toBeNull();
    expect(insight.className).toContain("min-h-11");
    expect(insight.className).not.toContain("basis-0");
    // The list below it takes the free height and scrolls in its own box (SG-LIST-01): so every box down to it may shrink
    // (`min-h-0`); the list keeps one row and a bit (`min-h-24`), and the frame scrolls where even that does not fit.
    const section = screen.getByRole("region", { name: "Pflanzen" });
    expect(section.className).toContain("min-h-0");
    expect(section.firstElementChild?.className).toContain("min-h-0");
  });

  it("US-QS-15 a swipe turns no page: the list scrolls and has no pages", () => {
    setViewportWidth(1024);
    screenWith(many(20));
    const list = screen.getByRole("list", { name: "Pflanzen" });
    fireEvent.pointerDown(list, { clientX: 200, clientY: 10 });
    fireEvent.pointerUp(list, { clientX: 100, clientY: 10 });
    expect(screen.queryByText(/^Seite \d+ von \d+$/)).toBeNull();
    expect(plantItems()).toHaveLength(20);
  });
});

describe("US-QS-15 the plants fill the free height of the region and scroll in it (tiles)", () => {
  it("US-QS-15 · SG-LIST-01 the list is a marked scroll region that takes the free height, at 1024 px as on a phone", () => {
    setViewportWidth(1024);
    screenWith(many(8));
    const list = screen.getByRole("list", { name: "Pflanzen" });
    expect(list.hasAttribute("data-scroll-region")).toBe(true);
    expect(list.className).toContain("overflow-y-auto");
    expect(list.className).toContain("flex-1");
    expect(list.className).toContain("min-h-24");
    expect(plantItems()).toHaveLength(8);
  });
});

describe("US-QS-19 the layers of the plants", () => {
  it("US-QS-19 the insight row names the thinnest zone and opens the layer with the distribution and the way to the management", async () => {
    const onManage = vi.fn();
    screenWith(many(2), { onManage });
    await userEvent.click(screen.getByRole("button", { name: /^Lichtzonen Zone 3 am leersten/ }));
    const layer = await screen.findByRole("dialog", { name: "Lichtzonen" });
    expect(screen.getByTestId("address").textContent).toBe("?sheet=zones");
    expect(within(layer).getByText(/Zone 3: 1 Pflanze/)).toBeTruthy();
    expect(within(layer).getByText(/am leersten/)).toBeTruthy();
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

  it("US-QS-15 · F12 a plant layer leaves as it came: its tabs stay while it slides out, then it is removed", async () => {
    holdSheetExit();
    screenWith([card(1, { name: "Aloe" })]);
    await openPlant("Aloe");
    await screen.findByRole("dialog", { name: "Aloe" });
    await userEvent.keyboard("{Escape}");
    expect(screen.getByTestId("address").textContent).toBe("");
    expect(screen.getByText("Art: Bogenhanf · Status: Pflanze")).toBeTruthy();
    endSheetExit();
    await waitFor(() => expect(screen.queryByText("Art: Bogenhanf · Status: Pflanze")).toBeNull());
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
    expect(screen.getByText("Du hast noch keine Pflanze")).toBeTruthy();
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
    delayLoads();
    render(page());
    expect((await screen.findByRole("status")).textContent).toContain("Sammlung wird geladen");
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
        return answerCardRead(new URL(String(url)), []) ?? Response.json({});
      }),
    );
    render(page());
    expect(await screen.findByText("Du hast noch keine Pflanze")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lichtzonen" })).toBeTruthy();
    vi.unstubAllGlobals();
  });
});

describe("NFR-12 the Sammlung transfers thumbnails only", () => {
  it("NFR-12 a Sammlung with 100 photographed plants requests only the thumbnails of the visible page", async () => {
    const requested: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url) => {
        requested.push(String(url));
        return {
          ok: true,
          status: 200,
          blob: async () => new Blob([new Uint8Array([1])]),
        } as Response;
      }),
    );
    URL.createObjectURL = vi.fn(() => "blob:plant");
    const photographed = Array.from({ length: 100 }, (_, i) =>
      card(i + 1, {
        photo: { url: `/specimens/e${i + 1}/measurements/m${i + 1}/photo`, date: "2026-10-01" },
      }),
    );
    screenWith(photographed);
    await waitFor(() => expect(requested.length).toBeGreaterThan(0));
    const visible = plantItems().length;
    await waitFor(() => expect(requested).toHaveLength(visible));
    expect(requested.every((url) => url.endsWith("/photo?size=thumb"))).toBe(true);
    vi.unstubAllGlobals();
  });
});
