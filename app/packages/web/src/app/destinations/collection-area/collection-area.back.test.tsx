// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { MemoryRouter, useLocation, useNavigate, type NavigateFunction } from "react-router";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ArchivedEntry, SpecimenCard } from "@pflanzendex/core";
import { CollectionArea } from "./collection-area";
import { EMPTY_DISTRIBUTION } from "../../../collection/insights/distribution-test-helpers";
import { answerCardRead } from "../../../collection/specimens/tests/cards-fake";
import {
  openArchive,
  openPlant,
  openTab,
} from "../../../collection/specimens/tests/plants-test-helpers";
import {
  GUARD,
  stateFlag,
} from "../../../collection/plants-screen/plant-layers/plant-forms/address/form-address";

// US-QS-32 (FX-44, issue 1983, owner answers Q-46 and Q-32): a form of a plant is opened above the plant's layer, so the
// chevron "Zurück zu <Pflanze>", "Abbrechen" and the system Back all return to the plant on the tab the form was opened from.
// A save returns there too, except the archive, whose plant has left the list.

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
  growth: { count: 0, ratePerYear: null, trend: null, signal: null },
};
const repotPlan = {
  specimenId: "e1",
  status: "plant",
  hidden: true,
  equipmentOff: true,
  freePots: [],
  currentPot: null,
};
/** The marker field, by its label (the form and the field share the word). */
const MARKER_FIELD = /^Kennzeichen(?: \(optional\))?$/;
/** The archived plant of the Archiv layer (d-054): its catch date is the one form that opens from there. */
const ARCHIVED: ArchivedEntry = {
  id: "e9",
  name: "Alter Ficus",
  speciesName: "Birkenfeige",
  caughtAt: "2026-01-05",
  archivedAt: "2026-10-02",
  archivedReason: "eingegangen",
};
/** The writes of a plant that answer with its row. */
const WRITE =
  /^\/specimens\/(?:e1\/(?:marker|catch-date|repot|light-zone|archive)|e9\/catch-date)$/;

beforeAll(async () => {
  await Promise.all([
    import("../../../collection/collection-page/collection-page"),
    import("../../../care/measure/measure-page/measure-page"),
    import("@/shared/ui/sheet.panel"),
    import("@/shared/platform/routing/route-focus/focus-moves"),
    import("../../../collection/plants-screen/plants-parts/plants-parts"),
    import("../../../care/plant-detail/plant-growth/plant-growth"),
    import("../../../monitoring/watering/water-action/water-action"),
  ]);
}, 30_000);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/**
 * The API of one plant with every write the forms send; `saves` collects the paths written. `archivedAfterMs` answers the list
 * of the archive late, as a slow network does: the read of a plant that is archived (not found) is then back first.
 */
function stubPlantApi(saves: string[] = [], archived: ArchivedEntry[] = [], archivedAfterMs = 0) {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path === "/locations") return response(200, { locations: [] });
      if (path === "/light-zones") return response(200, { zones: [] });
      if (path === "/specimens/archived") {
        if (archivedAfterMs > 0) await new Promise((done) => setTimeout(done, archivedAfterMs));
        return response(200, { archived });
      }
      if (path === "/specimens/distribution") return response(200, EMPTY_DISTRIBUTION);
      if (path === "/specimens/e1/measurements") return response(200, emptyView);
      if (path === "/specimens/e1/repot-plan") return response(200, repotPlan);
      if (init?.method === "POST" && WRITE.test(path)) {
        saves.push(path);
        return response(200, { ...card, name: "Bogenhanf – rot" });
      }
      return answerCardRead(new URL(String(url)), [card as SpecimenCard]) ?? response(404, {});
    }),
  );
}

/** The address of the render and the navigator of its router, so a test can press Back. */
const route: { navigate: NavigateFunction | null; search: string; guarded: boolean } = {
  navigate: null,
  search: "",
  guarded: false,
};
function Address() {
  const navigate = useNavigate();
  const location = useLocation();
  route.navigate = navigate;
  route.search = location.search;
  useLayoutEffect(() => {
    route.guarded = stateFlag(location.state, GUARD);
  }, [location]);
  return null;
}
const back = () => act(() => route.navigate?.(-1));
const forward = () => act(() => route.navigate?.(1));

function renderAt(entry: string) {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Address />
      <CollectionArea
        api="http://api"
        token={async () => "tok"}
        newSpecies={null}
        onSpeciesChoose={() => {}}
        onCompleted={() => {}}
      />
    </MemoryRouter>,
  );
}

/** One form of a plant: where it is opened from (a tab and the control there), its heading and the way it is saved. */
type FormCase = {
  kind: string;
  tab: { label: string; value: string };
  /** The menu item of "Mehr" or the button of the tab that opens the form. */
  open: { menu: string } | { button: string };
  heading: string;
  /** The button that saves; the measure view has no "Abbrechen" and stays open after a save. */
  save: string | null;
  cancel: boolean;
};
const OVERVIEW = { label: "Überblick", value: "ueberblick" };
const HISTORY = { label: "Verlauf", value: "verlauf" };
const CARE = { label: "Pflege", value: "pflege" };
const LOCATION = { label: "Standort", value: "standort" };
const FORMS: FormCase[] = [
  {
    kind: "measure",
    tab: OVERVIEW,
    open: { button: "Messen: Bogenhanf" },
    heading: "Messen",
    save: null,
    cancel: false,
  },
  {
    kind: "marker",
    tab: HISTORY,
    open: { menu: "Kennzeichen ändern" },
    heading: "Kennzeichen ändern",
    save: "Kennzeichen sichern",
    cancel: true,
  },
  {
    kind: "catch-date",
    tab: CARE,
    open: { menu: "Fangdatum ändern" },
    heading: "Fangdatum korrigieren",
    save: "Fangdatum sichern",
    cancel: true,
  },
  {
    kind: "archive-plant",
    tab: HISTORY,
    open: { menu: "Pflanze archivieren" },
    heading: "Pflanze archivieren",
    save: "Archivieren",
    cancel: true,
  },
  {
    kind: "repot",
    tab: CARE,
    open: { menu: "Umtopfen eintragen" },
    heading: "Pflanze umtopfen",
    save: "Sichern",
    cancel: true,
  },
  {
    kind: "light-zone",
    tab: LOCATION,
    open: { button: "Lichtzone ändern: Bogenhanf" },
    heading: "Lichtzone ändern",
    save: "Lichtzone sichern",
    cancel: true,
  },
];
const FORM_NAMES = FORMS.map((f) => [f.kind, f] as const);
const SAVING = FORMS.filter((f) => f.save !== null).map((f) => [f.kind, f] as const);

/** Opens the layer of Bogenhanf on the tab of the form and then the form (US-QS-32). */
async function openFormFromLayer(form: FormCase) {
  await screen.findByRole("button", { name: /^Bogenhanf(\s|$)/ }, { timeout: 5_000 });
  await openPlant("Bogenhanf");
  if (form.tab.value !== OVERVIEW.value) await openTab(form.tab.label);
  const layer = await screen.findByRole("dialog", { name: "Bogenhanf" });
  if ("menu" in form.open) {
    await userEvent.click(within(layer).getByRole("button", { name: "Mehr" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: form.open.menu }));
  } else {
    await userEvent.click(within(layer).getByRole("button", { name: form.open.button }));
  }
  await screen.findByRole("heading", { level: 1, name: form.heading }, { timeout: 5_000 });
  expect(route.search).toContain(`form=${form.kind}`);
}

/** The plant layer is open again on the tab the form came from, and no form is in the address. */
async function expectPlantLayer(tab: FormCase["tab"]) {
  await waitFor(() => expect(route.search).toContain("sheet=plant-e1"), { timeout: 5_000 });
  expect(route.search).not.toContain("form=");
  if (tab.value !== OVERVIEW.value) expect(route.search).toContain(`tab=${tab.value}`);
  expect(
    await screen.findByRole("tab", { name: tab.label, selected: true }, { timeout: 5_000 }),
  ).toBeTruthy();
}

describe("US-QS-32 a form of a plant leads back to the plant, on the tab it was opened from", () => {
  it.each(FORM_NAMES)(
    "US-QS-32 %s: the chevron is named after the plant and returns to the plant layer on its tab",
    async (_kind, form) => {
      stubPlantApi();
      renderAt("/collection?view=plants");
      await openFormFromLayer(form);
      await userEvent.click(screen.getByRole("button", { name: "Zurück zu Bogenhanf" }));
      await expectPlantLayer(form.tab);
    },
    15_000,
  );

  it.each(FORM_NAMES)(
    "US-QS-32 %s: the system Back returns to the plant layer on its tab",
    async (_kind, form) => {
      stubPlantApi();
      renderAt("/collection?view=plants");
      await openFormFromLayer(form);
      back();
      await expectPlantLayer(form.tab);
    },
    15_000,
  );

  it.each(FORM_NAMES.filter(([, form]) => form.cancel))(
    "US-QS-32 %s: Abbrechen returns to the plant layer on its tab",
    async (_kind, form) => {
      stubPlantApi();
      renderAt("/collection?view=plants");
      await openFormFromLayer(form);
      await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
      await expectPlantLayer(form.tab);
    },
    15_000,
  );

  it("US-QS-32 Back from the plant layer, which a form was opened from, then leaves to the list", async () => {
    stubPlantApi();
    renderAt("/collection?view=plants");
    await openFormFromLayer(FORMS[1] as FormCase);
    back();
    await expectPlantLayer(HISTORY);
    back();
    await waitFor(() => expect(route.search).not.toContain("sheet="));
    expect(route.search).not.toContain("form=");
  }, 15_000);

  it.each(SAVING.filter(([kind]) => kind !== "archive-plant"))(
    "US-QS-32 · Q-32 %s: a save returns to the plant layer, where the value shows",
    async (_kind, form) => {
      const saves: string[] = [];
      stubPlantApi(saves);
      renderAt("/collection?view=plants");
      await openFormFromLayer(form);
      if (form.kind === "marker") await userEvent.type(screen.getByLabelText(MARKER_FIELD), "rot");
      await userEvent.click(screen.getByRole("button", { name: form.save ?? "" }));
      await waitFor(() => expect(saves).toHaveLength(1), { timeout: 5_000 });
      await expectPlantLayer(form.tab);
    },
    15_000,
  );

  it("US-QS-32 · Q-32 the archive of a plant returns to the list: the plant has left it, so no layer opens", async () => {
    const saves: string[] = [];
    stubPlantApi(saves);
    renderAt("/collection?view=plants");
    await openFormFromLayer(FORMS[3] as FormCase);
    await userEvent.click(screen.getByRole("button", { name: "Archivieren" }));
    await waitFor(() => expect(saves).toEqual(["/specimens/e1/archive"]), { timeout: 5_000 });
    await waitFor(() => expect(route.search).not.toContain("form="), { timeout: 5_000 });
    expect(route.search).not.toContain("sheet=");
    expect(screen.queryByRole("dialog", { name: "Bogenhanf" })).toBeNull();
    expect(await screen.findByRole("heading", { level: 1, name: "Sammlung" })).toBeTruthy();
  }, 15_000);

  it("US-QS-32 a form opened by its address (a reload) has the plant layer below it, on its tab: Back returns to the plant", async () => {
    stubPlantApi();
    renderAt("/collection?view=plants&form=marker&plant=e1&tab=pflege");
    await screen.findByRole(
      "heading",
      { level: 1, name: "Kennzeichen ändern" },
      { timeout: 5_000 },
    );
    expect(screen.getByRole("button", { name: "Zurück zu Bogenhanf" })).toBeTruthy();
    back();
    await expectPlantLayer(CARE);
  }, 15_000);

  it("US-QS-32 a form opened by its address: the chevron returns to the plant layer too", async () => {
    stubPlantApi();
    renderAt("/collection?view=plants&form=repot&plant=e1");
    await screen.findByRole("heading", { level: 1, name: "Pflanze umtopfen" }, { timeout: 5_000 });
    // The plan of the plant is read first: the frame of the loaded form replaces the loading one, so wait for its field.
    await screen.findByLabelText("Umgetopft am");
    await userEvent.click(screen.getByRole("button", { name: "Zurück zu Bogenhanf" }));
    await expectPlantLayer(OVERVIEW);
  }, 15_000);

  it("US-QS-32 an address of a plant that is not there still closes with a notice to the list, never to a plant layer", async () => {
    stubPlantApi();
    renderAt("/collection?view=plants&form=marker&plant=zz");
    expect(
      await screen.findByText(
        "Diese Pflanze gibt es in deiner Sammlung nicht (mehr). Die Ansicht ist geschlossen.",
        undefined,
        { timeout: 5_000 },
      ),
    ).toBeTruthy();
    await waitFor(() => expect(route.search).not.toContain("form="));
    expect(route.search).not.toContain("sheet=");
  }, 15_000);
});

/** The archive list that answers after the read of the plant (not found, as it is archived): a reload must wait for it. */
const LATE_ARCHIVE_MS = 150;

/** Opens the layer Archiv and from it the catch-date form of the archived plant (the one form that opens there, d-054). */
async function openCatchDateFromArchive() {
  await screen.findByRole("button", { name: /^Bogenhanf(\s|$)/ }, { timeout: 5_000 });
  await openArchive();
  await userEvent.click(
    await screen.findByRole("button", { name: "Fangdatum ändern: Alter Ficus" }),
  );
  await screen.findByRole(
    "heading",
    { level: 1, name: "Fangdatum korrigieren" },
    { timeout: 5_000 },
  );
  expect(route.search).toContain("form=catch-date");
}

/** The Archiv layer is open again, and no form is in the address. */
async function expectArchiveLayer() {
  await waitFor(() => expect(route.search).toContain("sheet=archive"), { timeout: 5_000 });
  expect(route.search).not.toContain("form=");
  expect(await screen.findByRole("region", { name: "Archiv" }, { timeout: 5_000 })).toBeTruthy();
}

describe("US-QS-32 · d-054 the catch-date form opened from the Archiv names the Archiv as its way back", () => {
  it("US-QS-32 · d-054 the chevron reads Zurück zum Archiv, not Zurück zu <Pflanze>, and the plant's name stays the subject", async () => {
    stubPlantApi([], [ARCHIVED]);
    renderAt("/collection?view=plants");
    await openCatchDateFromArchive();
    expect(screen.getByRole("button", { name: "Zurück zum Archiv" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Zurück zu Alter Ficus" })).toBeNull();
    expect(screen.getByText("Alter Ficus", { selector: "p" })).toBeTruthy();
  }, 15_000);

  it("US-QS-32 · d-054 the chevron returns to the Archiv layer", async () => {
    stubPlantApi([], [ARCHIVED]);
    renderAt("/collection?view=plants");
    await openCatchDateFromArchive();
    await userEvent.click(screen.getByRole("button", { name: "Zurück zum Archiv" }));
    await expectArchiveLayer();
  }, 15_000);

  it("US-QS-32 · d-054 the system Back returns to the Archiv layer, and Back from there leaves to the list", async () => {
    stubPlantApi([], [ARCHIVED]);
    renderAt("/collection?view=plants");
    await openCatchDateFromArchive();
    back();
    await expectArchiveLayer();
    back();
    await waitFor(() => expect(route.search).not.toContain("sheet="));
    expect(route.search).not.toContain("form=");
  }, 15_000);

  it("US-QS-32 · d-054 Abbrechen returns to the Archiv layer without a write", async () => {
    const saves: string[] = [];
    stubPlantApi(saves, [ARCHIVED]);
    renderAt("/collection?view=plants");
    await openCatchDateFromArchive();
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    await expectArchiveLayer();
    expect(saves).toHaveLength(0);
  }, 15_000);

  it("US-QS-32 · Q-32 · d-054 a save returns to the Archiv layer", async () => {
    const saves: string[] = [];
    stubPlantApi(saves, [ARCHIVED]);
    renderAt("/collection?view=plants");
    await openCatchDateFromArchive();
    await userEvent.click(screen.getByRole("button", { name: "Fangdatum sichern" }));
    await waitFor(() => expect(saves).toEqual(["/specimens/e9/catch-date"]), { timeout: 5_000 });
    await expectArchiveLayer();
  }, 15_000);

  it("US-QS-32 · d-054 a reload at the form's address opens the Archiv layer under it: the chevron reads Zurück zum Archiv and returns there", async () => {
    stubPlantApi([], [ARCHIVED], LATE_ARCHIVE_MS);
    renderAt("/collection?view=plants");
    await openCatchDateFromArchive();
    const address = `/collection${route.search}`;
    cleanup();
    renderAt(address);
    await screen.findByRole(
      "heading",
      { level: 1, name: "Fangdatum korrigieren" },
      { timeout: 5_000 },
    );
    await userEvent.click(await screen.findByRole("button", { name: "Zurück zum Archiv" }));
    await expectArchiveLayer();
    back();
    await waitFor(() => expect(route.search).not.toContain("sheet="));
    expect(route.search).not.toContain("form=");
  }, 20_000);

  it("US-QS-32 · d-054 the system Back from a form opened by its address (a reload) returns to the Archiv layer", async () => {
    stubPlantApi([], [ARCHIVED], LATE_ARCHIVE_MS);
    renderAt("/collection?view=plants");
    await openCatchDateFromArchive();
    const address = `/collection${route.search}`;
    cleanup();
    renderAt(address);
    await screen.findByRole("button", { name: "Zurück zum Archiv" }, { timeout: 5_000 });
    back();
    await expectArchiveLayer();
  }, 20_000);

  it("US-QS-32 · d-054 the question about unsaved input still guards it: Verwerfen returns to the Archiv layer", async () => {
    stubPlantApi([], [ARCHIVED]);
    renderAt("/collection?view=plants");
    await openCatchDateFromArchive();
    fireEvent.change(screen.getByLabelText("Fangdatum"), { target: { value: "2025-12-24" } });
    await waitFor(() => expect(route.guarded).toBe(true));
    await userEvent.click(screen.getByRole("button", { name: "Zurück zum Archiv" }));
    const dialog = await screen.findByRole("dialog", { name: "Eingabe verwerfen?" });
    await waitFor(() => expect(route.guarded).toBe(true));
    await userEvent.click(within(dialog).getByRole("button", { name: "Eingabe verwerfen" }));
    await expectArchiveLayer();
    expect(route.guarded).toBe(false);
  }, 20_000);

  it("US-QS-32 · d-054 a catch-date address of a plant that is neither active nor archived still closes with a notice to the list, once the archive has answered", async () => {
    stubPlantApi([], [ARCHIVED], LATE_ARCHIVE_MS);
    renderAt("/collection?view=plants&form=catch-date&plant=zz&origin=archive");
    expect(
      await screen.findByText(
        "Diese Pflanze gibt es in deiner Sammlung nicht (mehr). Die Ansicht ist geschlossen.",
        undefined,
        { timeout: 5_000 },
      ),
    ).toBeTruthy();
    await waitFor(() => expect(route.search).not.toContain("form="));
    expect(route.search).not.toContain("sheet=plant");
  }, 15_000);

  it("US-QS-32 · d-054 the same form opened from the plant layer keeps Zurück zu <Pflanze>, also by its address", async () => {
    stubPlantApi([], [ARCHIVED]);
    renderAt("/collection?view=plants&form=catch-date&plant=e1&tab=pflege");
    await screen.findByRole(
      "heading",
      { level: 1, name: "Fangdatum korrigieren" },
      { timeout: 5_000 },
    );
    expect(screen.queryByRole("button", { name: "Zurück zum Archiv" })).toBeNull();
    await userEvent.click(await screen.findByRole("button", { name: "Zurück zu Bogenhanf" }));
    await expectPlantLayer(CARE);
  }, 15_000);
});

describe("US-QS-32 the unsaved-input question still guards a form that leads back to the plant", () => {
  /** Types into the marker form and waits for the guard entry to commit. */
  async function typeInMarker() {
    await openFormFromLayer(FORMS[1] as FormCase);
    await userEvent.type(screen.getByLabelText(MARKER_FIELD), "rot");
    await waitFor(() => expect(route.guarded).toBe(true));
  }

  it("US-QS-32 Back with typed input asks; Verwerfen returns to the plant layer on its tab and leaves no guard entry ahead", async () => {
    stubPlantApi();
    renderAt("/collection?view=plants");
    await typeInMarker();
    back();
    const dialog = await screen.findByRole("dialog", { name: "Eingabe verwerfen?" });
    await waitFor(() => expect(route.guarded).toBe(true));
    await userEvent.click(within(dialog).getByRole("button", { name: "Eingabe verwerfen" }));
    await expectPlantLayer(HISTORY);
    expect(route.guarded).toBe(false);
    // Forward reaches the form on its own entry; a second Forward finds no guard entry behind it.
    forward();
    await waitFor(() => expect(route.search).toContain("form=marker"));
    expect(route.guarded).toBe(false);
    forward();
    expect(route.guarded).toBe(false);
  }, 20_000);

  it("US-QS-32 the chevron with typed input asks, and Verwerfen returns to the plant layer on its tab", async () => {
    stubPlantApi();
    renderAt("/collection?view=plants");
    await typeInMarker();
    await userEvent.click(screen.getByRole("button", { name: "Zurück zu Bogenhanf" }));
    const dialog = await screen.findByRole("dialog", { name: "Eingabe verwerfen?" });
    await waitFor(() => expect(route.guarded).toBe(true));
    await userEvent.click(within(dialog).getByRole("button", { name: "Eingabe verwerfen" }));
    await expectPlantLayer(HISTORY);
  }, 20_000);

  it("US-QS-32 Weiter bearbeiten keeps the form and its input above the plant layer", async () => {
    stubPlantApi();
    renderAt("/collection?view=plants");
    await typeInMarker();
    back();
    const dialog = await screen.findByRole("dialog", { name: "Eingabe verwerfen?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Weiter bearbeiten" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Eingabe verwerfen?" })).toBeNull(),
    );
    expect((screen.getByLabelText(MARKER_FIELD) as HTMLInputElement).value).toBe("rot");
    expect(route.search).toContain("form=marker");
  }, 20_000);
});
