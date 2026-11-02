// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SpecimenCard } from "@pflanzendex/core";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/lib/viewport-mock";
import { EMPTY_DISTRIBUTION } from "../../../insights/distribution-test-helpers";
import { PlantsScreen } from "../../plants-screen";
import type { PlantSlots } from "../layer-ids";

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
      <PlantsScreen
        cards={cards}
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
      <Where />
    </MemoryRouter>,
  );
}
const open = async () => {
  await userEvent.click(await screen.findByRole("button", { name: /^Aloe / }));
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
    act(() => screen.getByRole("button", { name: "Browser zurück", hidden: true }).click());
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
    expect(within(panel).getByText("Zustand:").textContent).toContain("Gesund");
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

  it("US-QS-23 only Messen is filled, Gießen and Behandeln are outline buttons", async () => {
    setViewportWidth(360);
    const onMeasure = vi.fn();
    show([card()], { onMeasure });
    const layer = await open();
    const measure = within(layer).getByRole("button", { name: "Messen: Aloe" });
    expect(measure.className).toContain("bg-primary");
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
    expect(screen.queryByRole("dialog", { name: "Aloe" })).toBeNull();
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
    expect(await within(profile).findByText("Du hast noch keine Pflanze dieser Art.")).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Aloe" })).toBeNull();
    act(() => screen.getByRole("button", { name: "Browser zurück", hidden: true }).click());
    const back = await screen.findByRole("dialog", { name: "Aloe" });
    expect(within(back).getByRole("button", { name: "Pflegeprofil", pressed: true })).toBeTruthy();
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
  it("US-QS-23 the rarer actions sit in the menu Mehr and each opens its flow after the layer closes", async () => {
    setViewportWidth(360);
    const handlers = { onMark: vi.fn(), onCatchDate: vi.fn(), onArchive: vi.fn() };
    show([card()], handlers);
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Mehr" }));
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual([
      "Kennzeichen",
      "Fangdatum",
      "Archivieren",
    ]);
    await userEvent.click(screen.getByRole("menuitem", { name: "Archivieren" }));
    expect(handlers.onArchive).toHaveBeenCalledOnce();
    expect(handlers.onArchive.mock.calls[0]?.[0]).toMatchObject({ id: "e1" });
    expect(screen.queryByRole("dialog", { name: "Aloe" })).toBeNull();
  });

  it("US-QS-23 Eingetopft is offered for a cutting only", async () => {
    setViewportWidth(360);
    show([card({ status: "cutting" })], { onRepot: vi.fn() });
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Mehr" }));
    expect(screen.getByRole("menuitem", { name: "Eingetopft" })).toBeTruthy();
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
    expect(screen.getByRole("button", { name: /^Aloe / })).toBeTruthy();
    expect(within(pane).getAllByRole("tab")).toHaveLength(4);
  });
});
