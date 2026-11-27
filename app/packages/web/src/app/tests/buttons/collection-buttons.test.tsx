// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import type { ArchivedEntry, SpecimenCard, SpecimenHint } from "@pflanzendex/core";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { LayerHost } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { Button } from "@/shared/ui/button";
import { ArchivedList } from "../../../collection/archived/archived-list/archived-list";
import { Row as CareProfileRow } from "../../../collection/care-profile/sections/care-profile-fields/care-profile-row/care-profile-row";
import { EMPTY_DISTRIBUTION } from "../../../collection/insights/distribution-test-helpers";
import { LocateControl } from "../../../collection/markers/locate/locate-control/locate-control";
import { RepotPlanSection } from "../../../collection/markers/repot/repot-plan/repot-plan";
import { PLAN } from "../../../collection/markers/repot/repot-plan/repot-test-helpers/repot-test-helpers";
import { DifficultyPage } from "../../../collection/other-pages/difficulty-page/difficulty-page";
import { HintCard } from "../../../collection/other-pages/hints-page/hint-card/hint-card";
import { PlantLocation } from "../../../collection/plants-screen/plant-layers/plant-layer/plant-location/plant-location";
import { PlantOverview } from "../../../collection/plants-screen/plant-layers/plant-layer/plant-overview/plant-overview";
import { QuickActions } from "../../../collection/plants-screen/plant-layers/plant-layer/plant-overview/quick-actions/quick-actions";
import { PlantsScreen } from "../../../collection/plants-screen/plants-screen";
import { ViewLayer } from "../../../collection/plants-screen/plant-layers/view-layer/view-layer";
import { pagesOf, summaryOf } from "../../../collection/specimens/tests/plants-test-helpers";
import { filledIn, hasOwnBorder, isFilled, isNeutral, isPlain, isTinted } from "./button-roles";

// US-QS-32 (SG-BTN-01, SG-BTN-02, SG-COLOR-02), FX-39 sweep 1: the buttons of "Sammlung" are filled, tinted or plain, a row
// that opens a view or a layer is neutral, and a view has at most one filled button. The outline look is the tinted look, so
// a call site that moved is proved by the role it has now.
beforeAll(() => {
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
});
beforeEach(() => setViewportWidth(360));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const inRouter = (ui: ReactElement, url = "/") =>
  render(<MemoryRouter initialEntries={[url]}>{ui}</MemoryRouter>);
const button = (name: string | RegExp) => screen.getByRole("button", { name });

const card: SpecimenCard = {
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
};

describe("US-QS-32 · SG-BTN-01 the archive: one tinted action, one plain, no filled one", () => {
  const entry: ArchivedEntry = {
    id: "z1",
    name: "Aloe",
    speciesName: "Aloe vera",
    caughtAt: "2026-09-01",
    archivedAt: "2026-10-05",
    archivedReason: "verkauft",
  };

  it("US-QS-32 'Wiederherstellen' is tinted, 'Fangdatum ändern' is plain, and the card has no filled button", () => {
    render(<ArchivedList entries={[entry]} onRestore={vi.fn()} onCatchDate={vi.fn()} />);
    expect(isTinted(button("Wiederherstellen: Aloe"))).toBe(true);
    expect(isPlain(button("Fangdatum ändern: Aloe"))).toBe(true);
    expect(filledIn(document.body)).toHaveLength(0);
  });
});

describe("US-QS-32 · SG-BTN-02 the care profile row: the reset to the catalog is plain", () => {
  it("US-QS-32 each field row carries one plain reset, never a filled or tinted one", () => {
    render(
      <CareProfileRow
        label="Gießen"
        species="Aloe vera"
        catalog="alle 10 Tage"
        hasOwn
        busy={false}
        onReset={vi.fn()}
      >
        <p>Feld</p>
      </CareProfileRow>,
    );
    const reset = button("Auf Katalog zurücksetzen: Gießen (Aloe vera)");
    expect(isPlain(reset)).toBe(true);
    expect(filledIn(document.body)).toHaveLength(0);
  });
});

describe("US-QS-32 · SG-BTN-01 the location control: the next step is tinted, the write is the one filled button", () => {
  it("US-QS-32 without a location 'Standorte verwalten' is the one tinted action and nothing is filled", () => {
    render(
      <LocateControl
        specimenName="Aloe"
        locations={[]}
        busy={false}
        onLocate={vi.fn()}
        onCreateLocation={vi.fn()}
      />,
    );
    expect(isTinted(button("Standorte verwalten"))).toBe(true);
    expect(filledIn(document.body)).toHaveLength(0);
  });

  it("US-QS-32 with locations 'Standort setzen' is the only filled button", () => {
    render(
      <LocateControl
        specimenName="Aloe"
        locations={[{ id: "s1", name: "Regal", lightZoneId: null, kind: "indoor" }]}
        busy={false}
        onLocate={vi.fn()}
        onCreateLocation={vi.fn()}
      />,
    );
    expect(filledIn(document.body).map((b) => b.getAttribute("aria-label"))).toEqual([
      "Standort setzen: Aloe",
    ]);
  });
});

describe("US-QS-32 · SG-BTN-01 the hint card: the way to the fix is a tinted action", () => {
  const hint = (kind: SpecimenHint["kind"]): SpecimenHint => ({
    kind,
    specimenId: "e1",
    specimenName: "Aloe",
    locationId: null,
    text: "Aloe braucht einen Schritt.",
    nextAction: "Mach den Schritt.",
  });

  it("US-QS-32 'Zur Sammlung' and 'Standorte verwalten' are tinted, and the card has no filled button", () => {
    for (const [kind, label] of [
      ["species_missing", "Zur Sammlung"],
      ["location_without_zone", "Standorte verwalten"],
    ] as const) {
      render(
        <HintCard
          host
          hint={hint(kind)}
          locations={[]}
          busy={false}
          onOpen={vi.fn()}
          onLocate={vi.fn()}
        />,
      );
      expect(isTinted(button(label)), label).toBe(true);
      expect(filledIn(document.body), label).toHaveLength(0);
      cleanup();
    }
  });
});

describe("US-QS-32 · SG-BTN-01 the plant layer: one tinted action, plain openers, one filled action", () => {
  it("US-QS-32 on the overview 'Behandeln' and 'Notizen' are plain and no button of the overview is filled", () => {
    inRouter(
      <LayerHost>
        <PlantOverview
          card={card}
          access={{ api: "http://api", token: async () => "tok" }}
          onTreat={vi.fn()}
        />
      </LayerHost>,
    );
    expect(isPlain(button("Behandeln: Aloe"))).toBe(true);
    expect(isPlain(button(/Notizen/))).toBe(true);
    expect(filledIn(document.body)).toHaveLength(0);
  });

  it("US-QS-32 · issue 2424 in the quick actions 'Messen' is the one filled button, 'Gießen' and 'Foto' are tinted", () => {
    inRouter(
      <QuickActions
        card={card}
        onMeasure={vi.fn()}
        onPhoto={vi.fn()}
        water={
          <Button type="button" variant="tinted">
            Gießen
          </Button>
        }
      />,
    );
    expect(isTinted(button("Gießen"))).toBe(true);
    expect(isTinted(button("Foto: Aloe"))).toBe(true);
    expect(filledIn(document.body).map((b) => b.getAttribute("aria-label"))).toEqual([
      "Messen: Aloe",
    ]);
  });

  it("US-QS-32 on 'Standort' 'Lichtzone ändern' is tinted and the write 'Standort setzen' is the one filled button", () => {
    inRouter(
      <PlantLocation
        card={card}
        locations={[{ id: "s1", name: "Regal", lightZoneId: null, kind: "indoor" }]}
        busy={false}
        onLocate={vi.fn()}
        onLightZone={vi.fn()}
        onManage={vi.fn()}
      />,
    );
    expect(isTinted(button("Lichtzone ändern: Aloe"))).toBe(true);
    expect(filledIn(document.body).map((b) => b.getAttribute("aria-label"))).toEqual([
      "Standort setzen: Aloe",
    ]);
  });

  it("US-QS-32 on 'Umtopfen' the action is tinted, and the part has no filled button", () => {
    inRouter(
      <LayerHost>
        <RepotPlanSection
          card={card}
          plan={{
            status: "ready",
            value: PLAN,
            error: undefined,
            offline: false,
            placeholder: false,
            refreshing: false,
            retry: vi.fn(),
          }}
          onRepot={vi.fn()}
        />
      </LayerHost>,
    );
    expect(isTinted(button("Umtopfen eintragen"))).toBe(true);
    expect(filledIn(document.body)).toHaveLength(0);
  });
});

describe("US-QS-32 · SG-COLOR-02 the layer 'Ansicht': choices neutral until chosen, ways on as neutral rows", () => {
  const options = [
    { value: "all", label: "Alle" },
    { value: "location", label: "Nach Standort" },
  ] as const;
  const show = (group: "all" | "location") =>
    inRouter(
      <LayerHost>
        <ViewLayer
          group={group}
          options={options}
          onGroup={vi.fn()}
          label="Gruppierung der Pflanzen"
          onManage={vi.fn()}
          labelsTo="/collection/labels"
        />
      </LayerHost>,
      "/?sheet=view",
    );

  it("US-QS-32 the chosen choice is tinted with its check mark, the other is neutral, and none draws a border", async () => {
    show("location");
    const group = await screen.findByRole("group", { name: "Gruppierung der Pflanzen" });
    const chosen = within(group).getByRole("button", { name: "Nach Standort" });
    const other = within(group).getByRole("button", { name: "Alle" });
    expect(isTinted(chosen)).toBe(true);
    expect(chosen.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(other.querySelector("svg")).toBeNull();
    expect(isNeutral(other)).toBe(true);
    expect(hasOwnBorder(chosen) || hasOwnBorder(other)).toBe(false);
  });

  it("US-QS-32 the management and the print are neutral rows with a chevron, and the layer has no filled button", async () => {
    show("all");
    const dialog = await screen.findByRole("dialog", { name: "Ansicht" });
    const manage = within(dialog).getByRole("button", {
      name: "Standorte und Lichtzonen verwalten",
    });
    const labels = within(dialog).getByRole("link", { name: "Etiketten drucken" });
    for (const row of [manage, labels]) {
      expect(isNeutral(row)).toBe(true);
      expect(row.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    }
    expect(filledIn(dialog)).toHaveLength(0);
  });

  it("US-QS-32 without a way on the layer shows no empty group", async () => {
    inRouter(
      <LayerHost>
        <ViewLayer group="all" options={options} onGroup={vi.fn()} label="Gruppierung" />
      </LayerHost>,
      "/?sheet=view",
    );
    const dialog = await screen.findByRole("dialog", { name: "Ansicht" });
    expect(within(dialog).queryByRole("list")).toBeNull();
  });
});

describe("US-QS-32 · SG-COLOR-02 'Sammlung': the archive opener is plain, the zones layer ends in a neutral row", () => {
  const cards = [card];
  const archived: ArchivedEntry[] = [
    {
      id: "z1",
      name: "Efeu",
      speciesName: "Hedera helix",
      caughtAt: null,
      archivedAt: "2026-10-05",
      archivedReason: "verkauft",
    },
  ];
  const screenAt = (url: string) =>
    inRouter(
      <LayerHost>
        <PlantsScreen
          cards={cards}
          plants={pagesOf(cards)}
          summary={summaryOf(cards)}
          distribution={EMPTY_DISTRIBUTION.distribution}
          archived={archived}
          photoAccess={{ api: "http://api", token: async () => "tok" }}
          onSpeciesChoose={vi.fn()}
          onManage={vi.fn()}
          onRestore={vi.fn()}
          onArchivedCatchDate={vi.fn()}
          embedded
          slots={{}}
        />
      </LayerHost>,
      url,
    );

  it("US-QS-32 'Archiv (1)' is plain, and the add action is the one filled button of the screen", async () => {
    screenAt("/");
    expect(isPlain(await screen.findByRole("button", { name: "Archiv (1)" }))).toBe(true);
    expect(filledIn(document.body).map((b) => b.getAttribute("aria-label"))).toEqual([
      "Pflanze anlegen",
    ]);
  });

  it("US-QS-32 in the layer 'Lichtzonen' the way to the management is a neutral row with a chevron", async () => {
    screenAt("/?sheet=zones");
    const dialog = await screen.findByRole("dialog", { name: "Lichtzonen" });
    const manage = within(dialog).getByRole("button", {
      name: "Standorte und Lichtzonen verwalten",
    });
    expect(isNeutral(manage)).toBe(true);
    expect(manage.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(filledIn(dialog)).toHaveLength(0);
  });
});

describe("US-QS-32 · SG-COLOR-02 the species comparison: every entry is a neutral row with a chevron", () => {
  const zone = { id: "z2", name: "Zone 2", luxCeiling: 15000, ppfd: 300, sortOrder: 1 };
  const row = (id: string, name: string) => ({
    speciesId: id,
    speciesName: name,
    botanicalName: `${name} botanica`,
    zone,
    wateringHint: "alle 10 Tage",
    substrate: "Humus",
    pruning: "selten",
    successCriteria: "Neue Blätter wachsen aufrecht.",
    difficulty: 1,
  });

  it("US-QS-32 the entries carry no green fill and no border, show the chevron icon, and the page has no filled button", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        Promise.resolve(
          new Response(
            JSON.stringify({ rows: [row("sp1", "Bogenhanf"), row("sp2", "Gummibaum")] }),
            {
              status: 200,
            },
          ),
        ),
      ),
    );
    inRouter(<DifficultyPage api="http://api" token={async () => "tok"} />);
    const entries = await screen.findAllByRole("button", { name: /^Vergleichswerte: / });
    expect(entries).toHaveLength(2);
    for (const entry of entries) {
      expect(isNeutral(entry)).toBe(true);
      expect(hasOwnBorder(entry)).toBe(false);
      expect(entry.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    }
    await waitFor(() => expect(filledIn(document.body)).toHaveLength(0));
  });

  it("US-QS-32 in the layer of a species the way to the profile is tinted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              // A value that is missing folds into a line with the next step: here the way to the profile (P-09).
              rows: [
                { ...row("sp1", "Bogenhanf"), zone: null, wateringHint: null, substrate: null },
              ],
            }),
            { status: 200 },
          ),
        ),
      ),
    );
    inRouter(<DifficultyPage api="http://api" token={async () => "tok"} />, "/?sheet=compare-sp1");
    const dialog = await screen.findByRole("dialog", { name: "Bogenhanf" });
    expect(isTinted(within(dialog).getByRole("link", { name: "Artprofil öffnen" }))).toBe(true);
    expect(filledIn(dialog)).toHaveLength(0);
    expect(isFilled(within(dialog).getByRole("link", { name: "Artprofil öffnen" }))).toBe(false);
    await userEvent.keyboard("{Escape}");
  });
});
