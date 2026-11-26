// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import type { SpecimenCard } from "@pflanzendex/core";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { LayerHost } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { Pager } from "@/shared/patterns/responsive/pager/pager";
import { EMPTY_DISTRIBUTION } from "../../../insights/distribution-test-helpers";
import { PlantsScreen } from "../../plants-screen";
import { pagesOf, summaryOf } from "../../../specimens/tests/plants-test-helpers";
import type { PlantSlots } from "../layer-ids";
import { expectOneLoadingStatus } from "@/shared/ui/skeleton.loading-contract";
import table from "../plant-layers.de.json";
import { PlantLayerSkeleton } from "./plant-layer.skeleton";

beforeAll(() => {
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
});
afterEach(cleanup);

const card = (extra: Partial<SpecimenCard> = {}): SpecimenCard => ({
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
  lastMeasurement: { date: "2026-10-01", value: 12.5, quality: "healthy", note: null },
  treatment: null,
  provenance: null,
  moreTreatments: 0,
  ...extra,
});

function Where() {
  const { search } = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <span data-testid="address">{search}</span>
      <button type="button" onClick={() => void navigate(-1)}>
        Browser zurück
      </button>
    </>
  );
}

const SLOTS: PlantSlots = {
  growth: () => <p>Trend: stabil</p>,
  history: () => <p>Verlauf der Messungen</p>,
  care: () => <p>Behandlungen der Pflanze</p>,
  water: () => (
    <button type="button" className="border">
      Gießen
    </button>
  ),
};

type Extra = Partial<Parameters<typeof PlantsScreen>[0]>;
function show(cards: SpecimenCard[], extra: Extra = {}, at = "/") {
  return render(
    <MemoryRouter initialEntries={["/start", at]} initialIndex={at === "/" ? 0 : 1}>
      {/* The screen sits in the frame of the collection area (US-QS-15), so a layer opens in its pane. */}
      <LayerHost>
        <PlantsScreen
          cards={cards}
          plants={pagesOf(cards)}
          summary={summaryOf(cards)}
          distribution={EMPTY_DISTRIBUTION.distribution}
          archived={[]}
          photoAccess={{ api: "http://api", token: async () => "tok" }}
          onSpeciesChoose={vi.fn()}
          onManage={vi.fn()}
          onRestore={vi.fn()}
          onArchivedCatchDate={vi.fn()}
          embedded
          slots={SLOTS}
          {...extra}
        />
      </LayerHost>
      <Where />
    </MemoryRouter>,
  );
}
const open = async () => {
  await userEvent.click(await screen.findByRole("button", { name: /^Aloe(\s|$)/ }));
  return screen.findByRole("dialog", { name: "Aloe" });
};

describe("US-QS-23 a plant opens as a layer with tabs", () => {
  it("US-QS-23 a tile opens the layer ?sheet=plant-<id> with the name, the chips and the four tabs", async () => {
    setViewportWidth(360);
    show([
      card({ treatment: { reason: "Neem", dueDate: { kind: "soon", days: 2, text: "in 2 Tg." } } }),
    ]);
    const layer = await open();
    expect(screen.getByTestId("address").textContent).toBe("?sheet=plant-e1");
    const chips = within(layer).getByRole("list", { name: "Auf einen Blick" });
    expect(within(chips).getByText("Zone 3")).toBeTruthy();
    expect(within(chips).getByText("Regal Süd")).toBeTruthy();
    expect(within(chips).getByText("Behandeln")).toBeTruthy();
    const tabs = within(layer)
      .getAllByRole("tab")
      .map((t) => t.textContent);
    expect(tabs).toEqual(["Überblick", "Verlauf", "Pflege", "Standort"]);
  });

  it("NFR-13 the four tabs of a plant wrap at 200 % text instead of scrolling sideways", async () => {
    setViewportWidth(360);
    show([card()]);
    const layer = await open();
    const strip = within(layer).getByRole("tablist", { name: "Bereiche der Pflanze" });
    expect(strip.className.split(" ")).toContain("flex-wrap");
    expect(strip.className.split(" ")).not.toContain("overflow-x-auto");
    for (const tab of within(layer).getAllByRole("tab"))
      expect(tab.className.split(" ")).toContain("min-w-fit");
  });

  it("NFR-13 a long chip wraps inside its pill, so the header keeps the Mehr button beside the chips at 200 % text", async () => {
    setViewportWidth(360);
    show(
      [
        card({
          location: "Wohnzimmer Fenster Süd hinter dem Vorhang",
          treatment: { reason: "Neem", dueDate: { kind: "soon", days: 2, text: "in 2 Tg." } },
        }),
      ],
      { onArchive: vi.fn() },
    );
    const layer = await open();
    const chips = within(layer).getByRole("list", { name: "Auf einen Blick" });
    for (const text of ["Zone 3", "Wohnzimmer Fenster Süd hinter dem Vorhang", "Behandeln"]) {
      const classes = within(chips).getByText(text).className.split(" ");
      expect(classes).toContain("whitespace-normal");
      expect(classes).not.toContain("whitespace-nowrap");
    }
    expect(within(layer).getByRole("button", { name: "Mehr" })).toBeTruthy();
  });

  it("US-QS-23 · P-08 an unknown zone and location read unbekannt in the chips", async () => {
    setViewportWidth(360);
    show([card({ lightZone: null, lightZoneSource: null, location: null })]);
    const layer = await open();
    const chips = within(layer).getByRole("list", { name: "Auf einen Blick" });
    expect(within(chips).getByText("Zone unbekannt")).toBeTruthy();
    expect(within(chips).getByText("Standort unbekannt")).toBeTruthy();
  });

  it("US-QS-23 the active tab is in the address, Back leaves the layer in one step", async () => {
    setViewportWidth(360);
    show([card()]);
    const layer = await open();
    await userEvent.click(within(layer).getByRole("tab", { name: "Standort" }));
    expect(screen.getByTestId("address").textContent).toBe("?sheet=plant-e1&tab=standort");
    act(() => screen.getByText("Browser zurück").click());
    expect(screen.queryByRole("dialog", { name: "Aloe" })).toBeNull();
    expect(screen.getByTestId("address").textContent).toBe("");
  });

  it("US-QS-23 a copied link or a reload restores the tab", async () => {
    setViewportWidth(360);
    show([card()], {}, "/?sheet=plant-e1&tab=standort");
    const layer = await screen.findByRole("dialog", { name: "Aloe" });
    expect(within(layer).getByRole("tab", { name: "Standort", selected: true })).toBeTruthy();
    expect(within(layer).getByText("Standort: Regal Süd")).toBeTruthy();
  });

  it("US-QS-23 an unknown tab in the address shows the overview", async () => {
    setViewportWidth(360);
    show([card()], {}, "/?sheet=plant-e1&tab=nichts");
    const layer = await screen.findByRole("dialog", { name: "Aloe" });
    expect(within(layer).getByRole("tab", { name: "Überblick", selected: true })).toBeTruthy();
  });
});

describe("US-QS-23 Überblick", () => {
  it("US-QS-23 shows the last measurement with its date, the trend, the state and no scroll area of its own", async () => {
    setViewportWidth(360);
    show([card()]);
    const layer = await open();
    const panel = within(layer).getByRole("tabpanel");
    expect(within(panel).getByText(/Letzte Messung: 12,5 cm/)).toBeTruthy();
    expect(within(panel).getByText(/am 01\.10\.2026/)).toBeTruthy();
    expect(within(panel).getByText("Trend: stabil")).toBeTruthy();
    expect(within(panel).getByText("Qualität:").textContent).toContain("Gesund");
    expect(within(panel).getByText("Noch kein Foto")).toBeTruthy();
    expect(panel.innerHTML).not.toMatch(/overflow-(y-)?(auto|scroll)/);
  });

  it("US-QS-23 · US-QS-18 an overdue treatment reads '11 Tage überfällig' with the shared helper, never 'Tg.'", async () => {
    setViewportWidth(360);
    show([
      card({
        treatment: {
          reason: "Wollläuse",
          dueDate: { kind: "overdue", days: 11, text: "überfällig seit 11 Tg." },
        },
      }),
    ]);
    const layer = await open();
    const panel = within(layer).getByRole("tabpanel");
    expect(within(panel).getByText("11 Tage überfällig")).toBeTruthy();
    expect(panel.textContent).not.toMatch(/Tg\./);
    expect(within(panel).getByRole("button", { name: "Behandeln: Aloe" })).toBeTruthy();
  });

  it("US-QS-23 · P-08 without a measurement and a trend the overview says unbekannt, nothing is invented", async () => {
    setViewportWidth(360);
    show([card({ lastMeasurement: null })], { slots: {} });
    const layer = await open();
    const panel = within(layer).getByRole("tabpanel");
    expect(within(panel).getByText("noch keine Messung")).toBeTruthy();
    expect(within(panel).getByText("Trend: unbekannt")).toBeTruthy();
    expect(within(panel).getByText("unbekannt")).toBeTruthy();
  });

  it("US-QS-23 etiolated growth is never a success on the overview", async () => {
    setViewportWidth(360);
    show([
      card({
        lastMeasurement: { date: "2026-10-01", value: 20, quality: "etiolated", note: null },
      }),
    ]);
    const layer = await open();
    expect(within(layer).getAllByText("Vergeilt/dünn").length).toBeGreaterThan(0);
    expect(within(layer).getByText(/kein Erfolgssignal/)).toBeTruthy();
  });

  it("US-QS-23 · issue 2424 only Messen is filled, Foto is tinted and Gießen and Behandeln are not filled", async () => {
    setViewportWidth(360);
    const onMeasure = vi.fn();
    show([card()], { onMeasure });
    const layer = await open();
    const measure = within(layer).getByRole("button", { name: "Messen: Aloe" });
    expect(measure.className).toContain("bg-primary");
    expect(within(layer).getByRole("button", { name: "Foto: Aloe" }).className).toContain(
      "bg-accent",
    );
    for (const name of ["Gießen", "Behandeln: Aloe"]) {
      expect(within(layer).getByRole("button", { name }).className).not.toContain("bg-primary");
    }
    expect(
      within(layer)
        .getAllByRole("button")
        .filter((b) => b.className.includes("bg-primary")),
    ).toHaveLength(1);
    await userEvent.click(measure);
    expect(onMeasure).toHaveBeenCalledOnce();
    expect(onMeasure.mock.calls[0]?.[1]).toBeUndefined();
  });

  it("US-QS-23 · US-QS-15 · issue 2424 the quick actions stand under the title, before the chips and the tabs, and the layer has no primary action of its own", async () => {
    setViewportWidth(360);
    show([card()], { onMeasure: vi.fn() });
    const layer = await open();
    const row = within(layer).getByRole("group", { name: "Schnellaktionen" });
    const chips = within(layer).getByRole("list", { name: "Auf einen Blick" });
    const tabs = within(layer).getByRole("tablist");
    const follows = (a: Element, b: Element) =>
      (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    expect(follows(within(layer).getByRole("heading", { name: "Aloe" }), row)).toBe(true);
    expect(follows(row, chips)).toBe(true);
    expect(follows(row, tabs)).toBe(true);
    expect(
      within(row)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Messen", "Gießen", "Foto"]);
    // The primary slot "Messen" and the body button "Gießen" are replaced by the row (owner decision 2026-11-22, issue 2424): it
    // stays above the content, which scrolls under it, so the filled action never scrolls away (US-QS-15), and nothing is pinned below.
    expect(row.closest("[data-sheet-pinned]")).not.toBeNull();
    const region = layer.querySelector("[data-layer-body] > [data-scroll-region]") as HTMLElement;
    expect(region.contains(row)).toBe(false);
    expect(region.contains(chips)).toBe(true);
    expect(follows(row, region)).toBe(true);
    expect(layer.querySelectorAll("[data-sheet-pinned]")).toHaveLength(1);
    expect(within(layer).getAllByRole("button", { name: "Gießen" })).toHaveLength(1);
  });

  it("US-QS-23 · issue 2424 the quick actions show on the overview only, on every width", async () => {
    for (const width of [360, 768, 1280]) {
      setViewportWidth(width);
      const view = show([card()], { onMeasure: vi.fn() });
      await userEvent.click(await screen.findByRole("button", { name: /^Aloe(\s|$)/ }));
      // A sheet and a dialog are dialogs; from 1024 px the layer is the pane beside the list.
      const layer = await screen.findByRole(width >= 1024 ? "complementary" : "dialog", {
        name: "Aloe",
      });
      expect(within(layer).getByRole("group", { name: "Schnellaktionen" })).toBeTruthy();
      for (const tab of ["Verlauf", "Pflege", "Standort"]) {
        await userEvent.click(within(layer).getByRole("tab", { name: tab }));
        expect(within(layer).queryByRole("group", { name: "Schnellaktionen" }), tab).toBeNull();
        expect(within(layer).queryByRole("button", { name: "Foto: Aloe" }), tab).toBeNull();
      }
      await userEvent.click(within(layer).getByRole("tab", { name: "Überblick" }));
      expect(within(layer).getByRole("group", { name: "Schnellaktionen" })).toBeTruthy();
      view.unmount();
    }
  });

  it("US-QS-15 · issue 2424 Foto asks for the measure form with the photo picker started; Messen asks for the plain form", async () => {
    setViewportWidth(360);
    const onMeasure = vi.fn();
    show([card()], { onMeasure });
    const layer = await open();
    await userEvent.click(within(layer).getByRole("button", { name: "Foto: Aloe" }));
    expect(onMeasure).toHaveBeenCalledOnce();
    expect(onMeasure).toHaveBeenCalledWith(expect.objectContaining({ id: "e1" }), {
      photo: true,
    });
  });

  it("US-QS-23 · issue 2424 a layer that cannot measure has Gießen alone in the quick actions: no Messen, no Foto", async () => {
    setViewportWidth(360);
    show([card()]);
    const layer = await open();
    const row = within(layer).getByRole("group", { name: "Schnellaktionen" });
    expect(
      within(row)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Gießen"]);
  });

  it("US-QS-23 Behandeln leads to the tab Pflege", async () => {
    setViewportWidth(360);
    show([card()]);
    const layer = await open();
    await userEvent.click(within(layer).getByRole("button", { name: "Behandeln: Aloe" }));
    expect(screen.getByTestId("address").textContent).toBe("?sheet=plant-e1&tab=pflege");
  });
});

describe("US-QS-23 the other tabs", () => {
  it("US-QS-23 Verlauf shows the history part of the care module", async () => {
    setViewportWidth(360);
    show([card()]);
    const layer = await open();
    await userEvent.click(within(layer).getByRole("tab", { name: "Verlauf" }));
    expect(within(layer).getByText("Verlauf der Messungen")).toBeTruthy();
  });

  it("US-QS-23 Pflege shows the treatments of the care module first, the own profile is a second part", async () => {
    setViewportWidth(360);
    show([card()]);
    const layer = await open();
    await userEvent.click(within(layer).getByRole("tab", { name: "Pflege" }));
    expect(within(layer).getByText("Behandlungen der Pflanze")).toBeTruthy();
    expect(within(layer).queryByRole("heading", { name: "Eigenes Pflegeprofil" })).toBeNull();
    await userEvent.click(within(layer).getByRole("button", { name: "Pflegeprofil" }));
    expect(screen.getByTestId("address").textContent).toBe(
      "?sheet=plant-e1&tab=pflege&teil=profil",
    );
    expect(within(layer).queryByText("Behandlungen der Pflanze")).toBeNull();
    expect(within(layer).getByRole("heading", { name: "Eigenes Pflegeprofil" })).toBeTruthy();
  });

  it("US-BES-09 the own care profile opens its own layer and Back returns to the plant in the same part", async () => {
    setViewportWidth(360);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ entries: [], locations: [], zones: [] })),
    );
    show([card()], {}, "/?sheet=plant-e1&tab=pflege&teil=profil");
    const layer = await screen.findByRole("dialog", { name: "Aloe" });
    await userEvent.click(within(layer).getByRole("button", { name: "Pflegeprofil bearbeiten" }));
    const profile = await screen.findByRole("dialog", { name: "Pflegeprofil" });
    expect(screen.getByTestId("address").textContent).toBe(
      "?sheet=profil-e1&tab=pflege&teil=profil",
    );
    expect(await within(profile).findByText("Du hast noch keine Pflanze dieser Art")).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Aloe" })).toBeNull();
    act(() => screen.getByText("Browser zurück").click());
    const back = await screen.findByRole("dialog", { name: "Aloe" });
    expect(within(back).getByRole("button", { name: "Pflegeprofil", pressed: true })).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it("US-QS-15 closing the care profile with Escape returns the focus to Pflegeprofil bearbeiten (issue 1661)", async () => {
    setViewportWidth(360);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ entries: [], locations: [], zones: [] })),
    );
    show([card()]);
    const plant = await open();
    await userEvent.click(within(plant).getByRole("tab", { name: "Pflege" }));
    await userEvent.click(within(plant).getByRole("button", { name: "Pflegeprofil" }));
    await userEvent.click(within(plant).getByRole("button", { name: "Pflegeprofil bearbeiten" }));
    await screen.findByRole("dialog", { name: "Pflegeprofil" });
    await userEvent.keyboard("{Escape}");
    const back = await screen.findByRole("dialog", { name: "Aloe" });
    const opener = within(back).getByRole("button", { name: "Pflegeprofil bearbeiten" });
    await waitFor(() => expect(document.activeElement).toBe(opener));
    vi.unstubAllGlobals();
  });

  it("US-QS-15 Back from the care profile returns the focus to Pflegeprofil bearbeiten (issue 1661)", async () => {
    setViewportWidth(360);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ entries: [], locations: [], zones: [] })),
    );
    show([card()]);
    const plant = await open();
    await userEvent.click(within(plant).getByRole("tab", { name: "Pflege" }));
    await userEvent.click(within(plant).getByRole("button", { name: "Pflegeprofil" }));
    await userEvent.click(within(plant).getByRole("button", { name: "Pflegeprofil bearbeiten" }));
    await screen.findByRole("dialog", { name: "Pflegeprofil" });
    act(() => screen.getByText("Browser zurück").click());
    const back = await screen.findByRole("dialog", { name: "Aloe" });
    const opener = within(back).getByRole("button", { name: "Pflegeprofil bearbeiten" });
    await waitFor(() => expect(document.activeElement).toBe(opener));
    vi.unstubAllGlobals();
  });

  it("US-QS-23 a copied link restores the part of Pflege", async () => {
    setViewportWidth(360);
    show([card()], {}, "/?sheet=plant-e1&tab=pflege&teil=profil");
    const layer = await screen.findByRole("dialog", { name: "Aloe" });
    expect(within(layer).getByRole("button", { name: "Pflegeprofil", pressed: true })).toBeTruthy();
    expect(within(layer).getByRole("heading", { name: "Eigenes Pflegeprofil" })).toBeTruthy();
  });

  it("US-QS-23 Standort shows location and zone with its source and the actions to change them", async () => {
    setViewportWidth(360);
    const onLightZone = vi.fn();
    show([card()], {
      onLightZone,
      locations: [{ id: "s1", name: "Regal Süd" } as never],
      onLocate: vi.fn(),
    });
    const layer = await open();
    await userEvent.click(within(layer).getByRole("tab", { name: "Standort" }));
    expect(within(layer).getByText("Standort: Regal Süd")).toBeTruthy();
    expect(within(layer).getByText("Lichtzone: Zone 3 (vom Standort)")).toBeTruthy();
    expect(within(layer).getByLabelText("Standort für „Aloe“")).toBeTruthy();
    await userEvent.click(within(layer).getByRole("button", { name: "Lichtzone ändern: Aloe" }));
    expect(onLightZone).toHaveBeenCalledOnce();
  });

  it("US-QS-23 · P-08 Standort says unbekannt for an unknown location and zone", async () => {
    setViewportWidth(360);
    show([card({ location: null, lightZone: null, lightZoneSource: null })], {
      locations: [],
      onLocate: vi.fn(),
    });
    const layer = await open();
    await userEvent.click(within(layer).getByRole("tab", { name: "Standort" }));
    expect(within(layer).getByText("Standort: unbekannt")).toBeTruthy();
    expect(within(layer).getByText("Lichtzone: unbekannt")).toBeTruthy();
    expect(within(layer).getByText(/noch keinen Standort angelegt/)).toBeTruthy();
  });

  it("US-QS-23 choosing a location sends it and closes the layer", async () => {
    setViewportWidth(360);
    const onLocate = vi.fn();
    show([card({ location: null })], {
      locations: [{ id: "s1", name: "Regal Süd" } as never],
      onLocate,
    });
    const layer = await open();
    await userEvent.click(within(layer).getByRole("tab", { name: "Standort" }));
    await userEvent.selectOptions(within(layer).getByLabelText("Standort für „Aloe“"), "s1");
    await userEvent.click(within(layer).getByRole("button", { name: "Standort setzen: Aloe" }));
    expect(onLocate).toHaveBeenCalledWith("e1", "s1", expect.stringContaining("Regal Süd"));
    expect(screen.queryByRole("dialog", { name: "Aloe" })).toBeNull();
  });
});

describe("US-QS-23 Mehr", () => {
  it("US-QS-23 the rarer actions sit in the menu Mehr and each opens its flow", async () => {
    setViewportWidth(360);
    const handlers = { onMark: vi.fn(), onCatchDate: vi.fn(), onArchive: vi.fn() };
    show([card()], handlers);
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Mehr" }));
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual([
      "Kennzeichen ändern",
      "Fangdatum ändern",
      "Pflanze archivieren",
    ]);
    await userEvent.click(screen.getByRole("menuitem", { name: "Pflanze archivieren" }));
    expect(handlers.onArchive).toHaveBeenCalledOnce();
    expect(handlers.onArchive.mock.calls[0]?.[0]).toMatchObject({ id: "e1" });
  });

  it("US-QS-32 the menu items name object and verb: Umtopfen eintragen for a plant, Eintopfen eintragen for a cutting", async () => {
    setViewportWidth(360);
    show([card()], { onRepot: vi.fn() });
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Mehr" }));
    expect(screen.getByRole("menuitem", { name: "Umtopfen eintragen" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Umgetopft" })).toBeNull();
  });

  it("US-QS-23 Eintopfen eintragen is offered for a cutting only", async () => {
    setViewportWidth(360);
    show([card({ status: "cutting" })], { onRepot: vi.fn() });
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Mehr" }));
    expect(screen.getByRole("menuitem", { name: "Eintopfen eintragen" })).toBeTruthy();
  });

  it("US-QS-23 without any rarer action there is no menu", async () => {
    setViewportWidth(360);
    show([card()]);
    await open();
    expect(screen.queryByRole("button", { name: "Mehr" })).toBeNull();
  });
});

describe("US-QS-23 wide screen", () => {
  it("US-QS-23 from 1024 px the layer stands beside the tiles", async () => {
    setViewportWidth(1280);
    show([card()], {}, "/?sheet=plant-e1");
    const pane = await screen.findByRole("complementary", { name: "Aloe" });
    expect(pane).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Aloe(\s|$)/ })).toBeTruthy();
    expect(within(pane).getAllByRole("tab")).toHaveLength(4);
  });
});

describe("US-QS-14 issue 1697 · the plant layer show their shaped skeleton once", () => {
  it("US-QS-14 issue 1697 · a slow load shows one status with the loading text, and nothing before the delay", () =>
    expectOneLoadingStatus(
      <PlantLayerSkeleton label={table["layer.loading"]} />,
      table["layer.loading"],
    ));
});

/** A slot part that is still loading until `release` runs: it suspends with its promise, as a lazy part does (US-QS-14). */
function pendingPart(content: ReactNode) {
  let done = false;
  let release: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => {
    release = () => {
      done = true;
      resolve();
    };
  });
  const Part = () => {
    if (!done) throw ready;
    return content;
  };
  return { Part, release };
}

describe("US-QS-14 issue 1784 · the plant layer slot shows the shape of its part while it loads", () => {
  it("US-QS-14 issue 1784 · the growth slot shows its one-line shape after the delay, not a bare status text", async () => {
    setViewportWidth(360);
    const { Part, release } = pendingPart(<p>Trend: stabil</p>);
    show([card()], { slots: { ...SLOTS, growth: () => <Part /> } }, "/?sheet=plant-e1");
    expect(screen.queryByRole("status")).toBeNull();
    const status = await screen.findByRole("status");
    expect(status.querySelectorAll(".animate-pulse")).toHaveLength(1);
    await act(async () => release());
    expect(await screen.findByText("Trend: stabil")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("US-QS-14 issue 1784 · the care slot shows the shape of its treatments after the delay, not a bare status text", async () => {
    setViewportWidth(360);
    const { Part, release } = pendingPart(<p>Behandlungen der Pflanze</p>);
    show([card()], { slots: { ...SLOTS, care: () => <Part /> } }, "/?sheet=plant-e1&tab=pflege");
    expect(screen.queryByRole("status")).toBeNull();
    const status = await screen.findByRole("status");
    expect(status.querySelectorAll(".animate-pulse").length).toBeGreaterThan(1);
    await act(async () => release());
    expect(await screen.findByText("Behandlungen der Pflanze")).toBeTruthy();
  });
});

describe("US-QS-32 the action row of a plant has all its buttons from the first frame (SG-STATE-02, F-0082, issue 1889)", () => {
  it("US-QS-32 · SG-STATE-02 · issue 2424 while 'Gießen' loads, its disabled button stands in its place between 'Messen' and 'Foto'", async () => {
    setViewportWidth(360);
    const never = new Promise<never>(() => undefined);
    function Pending(): ReactNode {
      // A part that suspends for good, as a chunk on its way.
      throw never;
    }
    show([card()], { onMeasure: vi.fn(), slots: { ...SLOTS, water: () => <Pending /> } });
    const layer = await open();
    const water = within(layer).getByRole("button", { name: "Gießen" });
    expect((water as HTMLButtonElement).disabled).toBe(true);
    expect(water.getAttribute("aria-busy")).toBe("true");
    expect(water.previousElementSibling).toBe(
      within(layer).getByRole("button", { name: "Messen: Aloe" }),
    );
    expect(water.nextElementSibling).toBe(
      within(layer).getByRole("button", { name: "Foto: Aloe" }),
    );
  });
});

/** The Pflege tab with a paged list of three treatments: its own page part `ofrom`, as the care part pages its list. */
function PagedCare() {
  return (
    <Pager
      items={["Erste Behandlung", "Zweite Behandlung", "Dritte Behandlung"]}
      pageSize={1}
      label="Behandlungen"
      param="ofrom"
      renderItem={(item) => <p>{item}</p>}
    />
  );
}

describe("US-QS-15 issue 2147 · a plant opened by a reload closes to its list without the layer's tab and page", () => {
  it("US-QS-15 issue 2147 · a reload on Pflege with an old position, closed, leaves no tab or position in the list: the next plant opens on Überblick and shows its list from the start", async () => {
    setViewportWidth(768);
    show(
      [card(), card({ id: "e2", name: "Basilikum", speciesName: "Ocimum basilicum" })],
      { slots: { ...SLOTS, care: () => <PagedCare /> } },
      "/?sheet=plant-e1&tab=pflege&ofrom=2",
    );
    const aloe = await screen.findByRole("dialog", { name: "Aloe" });
    // The reload shows the stored tab; the list is one scroll list, an old position is not a page (US-QS-15).
    expect(within(aloe).getByRole("tab", { name: "Pflege", selected: true })).toBeTruthy();
    expect(within(aloe).queryByText(/Seite \d+ von \d+/)).toBeNull();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Aloe" })).toBeNull());
    // The list the layer closes to carries no part of the layer.
    expect(screen.getByTestId("address").textContent).toBe("");
    await userEvent.click(await screen.findByRole("button", { name: /^Basilikum(\s|$)/ }));
    const basilikum = await screen.findByRole("dialog", { name: "Basilikum" });
    expect(screen.getByTestId("address").textContent).toBe("?sheet=plant-e2");
    expect(within(basilikum).getByRole("tab", { name: "Überblick", selected: true })).toBeTruthy();
    await userEvent.click(within(basilikum).getByRole("tab", { name: "Pflege" }));
    expect(within(basilikum).queryByText(/Seite \d+ von \d+/)).toBeNull();
  });
});
