// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { MemoryRouter, useLocation, useNavigate, type NavigateFunction } from "react-router";
import { findCardButton } from "../../../collection/specimens/tests/plants-test-helpers";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CollectionArea } from "./collection-area";
import { RouteFocus } from "@/shared/platform/routing/route-focus/route-focus";
import { EMPTY_DISTRIBUTION } from "../../../collection/insights/distribution-test-helpers";
import { answerCardRead } from "../../../collection/specimens/tests/cards-fake";
import type { SpecimenCard } from "@pflanzendex/core";
import { FeaturesProvider } from "@/shared/data";
import { AnnouncerProvider } from "@/shared/platform/announcer/announcer";
import {
  GUARD,
  stateFlag,
} from "../../../collection/plants-screen/plant-layers/plant-forms/address/form-address";
import {
  GatedRouter,
  hold,
  releaseHold,
  resetHold,
} from "@/shared/patterns/responsive/layer-sheet/layer-sheet.test-helpers";

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
/** The row the API answers a written measurement with (US-WAC-01). */
const savedRow = {
  id: "m1",
  specimenId: "e1",
  date: "2026-11-15",
  value: 44,
  quality: "healthy",
  note: null,
  ratedBy: "keeper",
  photo: null,
};
const emptyView = {
  specimenId: "e1",
  growthMeasure: null,
  measurements: [],
  last: null,
  lastRating: null,
  growth: { count: 0, ratePerYear: null, trend: null, signal: null },
};

// The pages are lazy chunks (DS-08). Loading them first makes the waits below depend on the data only, not on how long
// the first import of a chunk takes on a busy machine (#444). The sheet's code is one of them: a layer's sheet asks for
// it 1.5 s after it mounts (sheet.tsx), and that first transform in the middle of a test stalled it for seconds (issue 2136).
// The collection page renders three lazy parts of its own (the plant list, the growth and the watering of a plant).
// Their first import ran in the first test of the file (about 40 ms each on a quiet machine, issue 1839), so they load
// here too.
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
  resetHold();
  vi.unstubAllGlobals();
});

/** The API of one plant (Bogenhanf) with its measurements, locations and archive; `saves` collects the measurements written. */
function stubCollection(saves: string[] = []) {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path === "/locations") return response(200, { locations: [] });
      if (path === "/specimens/archived") return response(200, { archived: [] });
      if (path === "/specimens/distribution") return response(200, EMPTY_DISTRIBUTION);
      if (path === "/specimens/e1/measurements" && init?.method === "POST") {
        saves.push(String(init.body));
        return response(201, savedRow);
      }
      if (path === "/specimens/e1/measurements") return response(200, emptyView);
      return answerCardRead(new URL(String(url)), [card as SpecimenCard]) ?? response(404, {});
    }),
  );
}

function renderArea() {
  render(
    <MemoryRouter>
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

// Budget 15 s, not the default 5 s (issue 1839). This first test loads the collection page's lazy parts and waits up to
// 5 s per step. Under 16 busy loops (local runs of the file before this change) it took 1.4 s at the median and, in 1 of
// 65 runs, 5076 ms, so it timed out. Stalls of 3 to 5 s hit other tests of the file under the same load, and they passed.
describe("US-WAC-01 collection wired with measuring", () => {
  it("US-WAC-01 measuring on the specimen opens the measure view, back leads to the plant (US-QS-32)", async () => {
    stubCollection();
    renderArea();
    // The collection page is a lazy part; its first import can take longer than the default second under load.
    await screen.findByRole("button", { name: /^Bogenhanf(\s|$)/ }, { timeout: 5_000 });
    await userEvent.click(await findCardButton("Messen: Bogenhanf"));
    expect(await screen.findByRole("heading", { name: "Messen" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Zurück zu Bogenhanf" }));
    expect(await screen.findByRole("dialog", { name: "Bogenhanf" })).toBeTruthy();
  });

  it("US-QS-15 · issue 2424 Foto in the plant layer opens the measure view with the photo field open and its picker started; Messen opens it as before", async () => {
    stubCollection();
    const click = vi.spyOn(HTMLInputElement.prototype, "click");
    renderArea();
    await screen.findByRole("button", { name: /^Bogenhanf(\s|$)/ }, { timeout: 5_000 });
    await userEvent.click(await findCardButton("Foto: Bogenhanf"));
    expect(await screen.findByRole("heading", { name: "Messen" })).toBeTruthy();
    const choose = await screen.findByLabelText("Foto wählen");
    expect((screen.getByText("Mehr Angaben").closest("details") as HTMLDetailsElement).open).toBe(
      true,
    );
    expect(click.mock.contexts.filter((input) => input === choose)).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Zurück zu Bogenhanf" }));
    expect(await screen.findByRole("dialog", { name: "Bogenhanf" })).toBeTruthy();
    // Messen asks for no picker: the form opens with its optional fields closed.
    click.mockClear();
    await userEvent.click(await findCardButton("Messen: Bogenhanf"));
    await screen.findByRole("heading", { name: "Messen" });
    await screen.findByLabelText("Foto wählen");
    expect((screen.getByText("Mehr Angaben").closest("details") as HTMLDetailsElement).open).toBe(
      false,
    );
    expect(click).not.toHaveBeenCalled();
    click.mockRestore();
  });
}, 15_000);

/** The address of the test render and the navigator of its router, so a test can press Back (US-QS-15). */
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
  // The guard flag comes from the committed location only: a render that React throws away must not set it.
  useLayoutEffect(() => {
    route.guarded = stateFlag(location.state, GUARD);
  }, [location]);
  return null;
}
const back = () => act(() => route.navigate?.(-1));
const forward = () => act(() => route.navigate?.(1));

/** Renders the area under the gated router, for the tests that hold a guard entry (issue 2154). */
function renderHeldAt(entry: string) {
  render(
    <GatedRouter entry={entry}>
      <Address />
      <CollectionArea
        api="http://api"
        token={async () => "tok"}
        newSpecies={null}
        onSpeciesChoose={() => {}}
        onCompleted={() => {}}
      />
    </GatedRouter>,
  );
}
const NOT_FOUND_TEXT =
  "Diese Pflanze gibt es in deiner Sammlung nicht (mehr). Die Ansicht ist geschlossen.";

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

// The budget of this describe is 15 s, not the default 5 s (issue 1839). Each flow waits for the dialog, the guard entry
// and the closing of the view one after the other, and the waits allow 4 to 5 s each, so their sum can exceed the 5 s of
// the test. On the CI runner of issue 1839 the Verwerfen test took 5020 ms and timed out, while the file took 9.7 s
// against 3.0 s in the passing run of the same commit (the other tests of that run were slower too). The test takes about
// 80 ms idle; under 16 busy loops its median was 320 ms over 105 runs, with 2 runs above 1 s (local runs). The wait
// timeouts stay as they are; the budget covers such stalls.
describe("US-QS-15 the forms of a plant are full views with an address", () => {
  it("US-WAC-01 Messen pushes an address with the plant, and Back closes the measure view", async () => {
    stubCollection();
    renderAt("/collection?view=plants");
    await screen.findByRole("button", { name: /^Bogenhanf(\s|$)/ }, { timeout: 5_000 });
    await userEvent.click(await findCardButton("Messen: Bogenhanf"));
    await screen.findByRole("heading", { name: "Messen" });
    expect(route.search).toContain("form=measure");
    expect(route.search).toContain("plant=e1");
    back();
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Messen" })).toBeNull());
  });

  it("US-QS-15 Back from the measure view returns to the plant's layer, and the focus is in it (US-QS-32)", async () => {
    stubCollection();
    render(
      <MemoryRouter>
        <Address />
        <RouteFocus titleOf={() => "Sammlung"} />
        <CollectionArea
          api="http://api"
          token={async () => "tok"}
          newSpecies={null}
          onSpeciesChoose={() => {}}
          onCompleted={() => {}}
        />
      </MemoryRouter>,
    );
    await screen.findByRole("button", { name: /^Bogenhanf(\s|$)/ }, { timeout: 5_000 });
    // RouteFocus loads its focus module after the first paint (DS-08) and remembers the opener from then on.
    await userEvent.click(await findCardButton("Messen: Bogenhanf"));
    await screen.findByRole("heading", { name: "Messen" });
    back();
    const layer = await screen.findByRole("dialog", { name: "Bogenhanf" });
    await waitFor(() => expect(layer.contains(document.activeElement)).toBe(true), {
      timeout: 8_000,
    });
    expect(screen.queryByRole("heading", { name: "Messen" })).toBeNull();
  }, 15_000);

  it("US-WAC-01 a reload at the address of the measure view opens it for that plant", async () => {
    stubCollection();
    renderAt("/collection?view=plants&form=measure&plant=e1");
    expect(await screen.findByRole("heading", { name: "Messen" }, { timeout: 5_000 })).toBeTruthy();
  });

  it("US-WAC-01 Back with typed measurement asks before it leaves; Weiter bearbeiten keeps the input", async () => {
    stubCollection();
    renderAt("/collection?view=plants&form=measure&plant=e1");
    await screen.findByRole("heading", { name: "Messen" }, { timeout: 5_000 });
    await userEvent.type(await screen.findByLabelText(/^Messwert/), "44");
    // The first input pushes the guard entry; a Back before that commit is the race of the bug
    // "Verwerfen can leave a plant form open when the guard entry commits late".
    await waitFor(() => expect(route.guarded).toBe(true));
    back();
    const dialog = await screen.findByRole("dialog", { name: "Eingabe verwerfen?" });
    expect(document.getElementById("measure-title")).not.toBeNull();
    await userEvent.click(within(dialog).getByRole("button", { name: "Weiter bearbeiten" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Eingabe verwerfen?" })).toBeNull(),
    );
    expect((screen.getByLabelText(/^Messwert/) as HTMLInputElement).value).toBe("44");
  });

  it("US-WAC-01 Verwerfen after a Back with typed measurement leaves the measure view", async () => {
    stubCollection();
    renderAt("/collection?view=plants&form=measure&plant=e1");
    await screen.findByRole("heading", { name: "Messen" }, { timeout: 5_000 });
    await userEvent.type(await screen.findByLabelText(/^Messwert/), "44");
    // The first input pushes the guard entry; a Back before that commit is the race of the bug
    // "Verwerfen can leave a plant form open when the guard entry commits late".
    await waitFor(() => expect(route.guarded).toBe(true));
    back();
    const dialog = await screen.findByRole("dialog", { name: "Eingabe verwerfen?" });
    // The question shows before the router commits the guard entry it pushed again. A Verwerfen before that commit runs
    // into the bug "Verwerfen can leave a plant form open when the guard entry commits late", so the test waits for the
    // commit, as the next tap of a person would.
    await waitFor(() => expect(route.guarded).toBe(true));
    await userEvent.click(within(dialog).getByRole("button", { name: "Eingabe verwerfen" }));
    await waitFor(() => expect(document.getElementById("measure-title")).toBeNull(), {
      timeout: 5_000,
    });
    expect(route.search).not.toContain("form=measure");
  });

  it("US-BES-03 the marker form asks before Back takes typed input, and closes when Verwerfen", async () => {
    stubCollection();
    renderAt("/collection?view=plants");
    await screen.findByRole("button", { name: /^Bogenhanf(\s|$)/ }, { timeout: 5_000 });
    await userEvent.click(await findCardButton("Kennzeichen ändern: Bogenhanf"));
    await screen.findByRole("heading", { name: "Kennzeichen ändern" });
    expect(route.search).toContain("form=marker");
    await userEvent.type(await screen.findByLabelText(/^Kennzeichen(?: \(optional\))?$/), "rot");
    // The first input pushes the guard entry; a Back before that commit is the race of the bug
    // "Verwerfen can leave a plant form open when the guard entry commits late".
    await waitFor(() => expect(route.guarded).toBe(true));
    back();
    const dialog = await screen.findByRole("dialog", { name: "Eingabe verwerfen?" });
    // The question shows before the router commits the guard entry it pushed again. A Verwerfen before that commit runs
    // into the bug "Verwerfen can leave a plant form open when the guard entry commits late", so the test waits for the
    // commit, as the next tap of a person would.
    await waitFor(() => expect(route.guarded).toBe(true));
    await userEvent.click(within(dialog).getByRole("button", { name: "Eingabe verwerfen" }));
    await waitFor(() => expect(document.getElementById("marker-title")).toBeNull(), {
      timeout: 5_000,
    });
  });

  it("US-BES-03 a reload at the marker address opens the marker form for that plant", async () => {
    stubCollection();
    renderAt("/collection?view=plants&form=marker&plant=e1");
    expect(
      await screen.findByRole("heading", { name: "Kennzeichen ändern" }, { timeout: 5_000 }),
    ).toBeTruthy();
  });

  it("US-QS-15 an address of a plant that is not there closes with a notice (P-10), never with a blank view", async () => {
    stubCollection();
    renderAt("/collection?view=plants&form=marker&plant=zz");
    expect(await screen.findByText(NOT_FOUND_TEXT, undefined, { timeout: 5_000 })).toBeTruthy();
    expect(document.getElementById("marker-title")).toBeNull();
    await waitFor(() => expect(route.search).not.toContain("form=marker"));
  });

  it("US-QS-32 · SG-COLOR-04 the notice of a plant that is not there is a failed load: the error tone, not amber", async () => {
    stubCollection();
    renderAt("/collection?view=plants&form=marker&plant=zz");
    const notice = (await screen.findByText(NOT_FOUND_TEXT, undefined, { timeout: 5_000 })).closest(
      "[role]",
    );
    expect(notice?.getAttribute("role")).toBe("alert");
    expect(notice?.className).toContain("border-destructive");
    expect(notice?.className).not.toMatch(/warning/);
  });

  it("US-QS-15 two quick Backs with typed measurement keep the measure view and ask; Verwerfen then walks back to the list", async () => {
    stubCollection();
    renderAt("/collection?view=plants&form=measure&plant=e1");
    await screen.findByRole("heading", { name: "Messen" }, { timeout: 5_000 });
    await userEvent.type(await screen.findByLabelText(/^Messwert/), "44");
    // The first input pushes the guard entry, as in the Back tests above.
    await waitFor(() => expect(route.guarded).toBe(true));
    // Both Backs land before the form has handled the first one: they are batched into one render (US-QS-15).
    act(() => {
      route.navigate?.(-1);
      route.navigate?.(-1);
    });
    const dialog = await screen.findByRole("dialog", { name: "Eingabe verwerfen?" });
    // The guard entry commits after the question shows, as in the Verwerfen test above.
    await waitFor(() => expect(route.guarded).toBe(true));
    expect(document.getElementById("measure-title")).not.toBeNull();
    expect(route.search).toContain("form=measure");
    expect((screen.getByLabelText(/^Messwert/) as HTMLInputElement).value).toBe("44");
    await userEvent.click(within(dialog).getByRole("button", { name: "Eingabe verwerfen" }));
    await waitFor(() => expect(document.getElementById("measure-title")).toBeNull(), {
      timeout: 5_000,
    });
    expect(route.search).not.toContain("form=measure");
  });

  it("US-QS-15 two quick Backs with typed measurement, then Weiter bearbeiten, keep the input and the measure view", async () => {
    stubCollection();
    renderAt("/collection?view=plants&form=measure&plant=e1");
    await screen.findByRole("heading", { name: "Messen" }, { timeout: 5_000 });
    await userEvent.type(await screen.findByLabelText(/^Messwert/), "44");
    // The first input pushes the guard entry, as in the Back tests above.
    await waitFor(() => expect(route.guarded).toBe(true));
    act(() => {
      route.navigate?.(-1);
      route.navigate?.(-1);
    });
    const dialog = await screen.findByRole("dialog", { name: "Eingabe verwerfen?" });
    // The guard entry commits after the question shows, as in the Verwerfen test above.
    await waitFor(() => expect(route.guarded).toBe(true));
    await userEvent.click(within(dialog).getByRole("button", { name: "Weiter bearbeiten" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Eingabe verwerfen?" })).toBeNull(),
    );
    expect(document.getElementById("measure-title")).not.toBeNull();
    expect(route.search).toContain("form=measure");
    expect((screen.getByLabelText(/^Messwert/) as HTMLInputElement).value).toBe("44");
  });

  it("US-WAC-01 Verwerfen before the re-pushed guard entry commits still leaves the measure view (issue 2154)", async () => {
    stubCollection();
    renderHeldAt("/collection?view=plants&form=measure&plant=e1");
    await screen.findByRole("heading", { name: "Messen" }, { timeout: 5_000 });
    await userEvent.type(await screen.findByLabelText(/^Messwert/), "44");
    await waitFor(() => expect(route.guarded).toBe(true));
    // The guard entry that Back pushes again stays pending while the question shows (a slow device, issue 2154).
    hold.on = true;
    back();
    const dialog = await screen.findByRole("dialog", { name: "Eingabe verwerfen?" });
    expect(route.guarded).toBe(false);
    await userEvent.click(within(dialog).getByRole("button", { name: "Eingabe verwerfen" }));
    await releaseHold();
    await waitFor(() => expect(document.getElementById("measure-title")).toBeNull(), {
      timeout: 5_000,
    });
    expect(route.search).not.toContain("form=measure");
  }, 15_000);

  it("US-QS-15 Back before the first guard entry commits still asks (issue 2154)", async () => {
    stubCollection();
    renderHeldAt("/collection?view=plants&form=measure&plant=e1");
    await screen.findByRole("heading", { name: "Messen" }, { timeout: 5_000 });
    // The first input pushes the guard entry, and that entry stays pending: Back then lands on the form entry shown.
    hold.on = true;
    await userEvent.type(await screen.findByLabelText(/^Messwert/), "44");
    back();
    const dialog = await screen.findByRole("dialog", { name: "Eingabe verwerfen?" });
    expect(document.getElementById("measure-title")).not.toBeNull();
    expect((screen.getByLabelText(/^Messwert/) as HTMLInputElement).value).toBe("44");
    await releaseHold();
    await userEvent.click(within(dialog).getByRole("button", { name: "Weiter bearbeiten" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Eingabe verwerfen?" })).toBeNull(),
    );
    expect(document.getElementById("measure-title")).not.toBeNull();
    expect((screen.getByLabelText(/^Messwert/) as HTMLInputElement).value).toBe("44");
  }, 15_000);

  it("US-QS-15 Verwerfen before the held form and its guard entry commit still leaves the measure view (issue 2154)", async () => {
    stubCollection();
    renderHeldAt("/collection?view=plants&form=measure&plant=e1");
    await screen.findByRole("heading", { name: "Messen" }, { timeout: 5_000 });
    await userEvent.type(await screen.findByLabelText(/^Messwert/), "44");
    await waitFor(() => expect(route.guarded).toBe(true));
    // The two quick Backs land on the list; the form is held and put back with its guard entry, which stays pending.
    hold.on = true;
    act(() => {
      route.navigate?.(-1);
      route.navigate?.(-1);
    });
    const dialog = await screen.findByRole("dialog", { name: "Eingabe verwerfen?" });
    expect(route.guarded).toBe(false);
    await userEvent.click(within(dialog).getByRole("button", { name: "Eingabe verwerfen" }));
    await releaseHold();
    await waitFor(() => expect(document.getElementById("measure-title")).toBeNull(), {
      timeout: 5_000,
    });
    expect(route.search).not.toContain("form=measure");
  }, 15_000);

  /**
   * Forward twice from the list (issue 2158): the measure view comes back on its own entry, and the second Forward leaves
   * it. No entry ahead carries the form guard, so the second Forward never lands on a guard entry.
   */
  async function forwardOpensThenLeaves() {
    forward();
    await waitFor(() => expect(route.search).toContain("form=measure"));
    expect(route.guarded).toBe(false);
    await waitFor(() => expect(document.getElementById("measure-title")).not.toBeNull(), {
      timeout: 5_000,
    });
    forward();
    await waitFor(() => expect(route.search).not.toContain("form=measure"));
    expect(route.guarded).toBe(false);
    expect(document.getElementById("measure-title")).toBeNull();
  }

  it("US-QS-15 Verwerfen after a Back with typed measurement leaves no guard entry ahead of a form opened by the app (issue 2158)", async () => {
    stubCollection();
    renderAt("/collection?view=plants");
    await screen.findByRole("button", { name: /^Bogenhanf(\s|$)/ }, { timeout: 5_000 });
    await userEvent.click(await findCardButton("Messen: Bogenhanf"));
    await screen.findByRole("heading", { name: "Messen" });
    await userEvent.type(await screen.findByLabelText(/^Messwert/), "44");
    await waitFor(() => expect(route.guarded).toBe(true));
    back();
    const dialog = await screen.findByRole("dialog", { name: "Eingabe verwerfen?" });
    await waitFor(() => expect(route.guarded).toBe(true));
    await userEvent.click(within(dialog).getByRole("button", { name: "Eingabe verwerfen" }));
    await waitFor(() => expect(document.getElementById("measure-title")).toBeNull(), {
      timeout: 5_000,
    });
    await forwardOpensThenLeaves();
  }, 15_000);

  it("US-QS-15 Verwerfen after a Back with typed measurement leaves no guard entry ahead of a form opened by a reload (issue 2158)", async () => {
    stubCollection();
    renderAt("/collection?view=plants&form=measure&plant=e1");
    await screen.findByRole("heading", { name: "Messen" }, { timeout: 5_000 });
    await userEvent.type(await screen.findByLabelText(/^Messwert/), "44");
    await waitFor(() => expect(route.guarded).toBe(true));
    back();
    const dialog = await screen.findByRole("dialog", { name: "Eingabe verwerfen?" });
    await waitFor(() => expect(route.guarded).toBe(true));
    await userEvent.click(within(dialog).getByRole("button", { name: "Eingabe verwerfen" }));
    await waitFor(() => expect(document.getElementById("measure-title")).toBeNull(), {
      timeout: 5_000,
    });
    expect(route.search).not.toContain("form=measure");
    await forwardOpensThenLeaves();
  }, 15_000);

  it("US-QS-15 Verwerfen after the view's own back control with typed measurement leaves no guard entry ahead (issue 2158)", async () => {
    stubCollection();
    renderAt("/collection?view=plants");
    await screen.findByRole("button", { name: /^Bogenhanf(\s|$)/ }, { timeout: 5_000 });
    await userEvent.click(await findCardButton("Messen: Bogenhanf"));
    await screen.findByRole("heading", { name: "Messen" });
    await userEvent.type(await screen.findByLabelText(/^Messwert/), "44");
    await waitFor(() => expect(route.guarded).toBe(true));
    await userEvent.click(screen.getByRole("button", { name: "Zurück zu Bogenhanf" }));
    const dialog = await screen.findByRole("dialog", { name: "Eingabe verwerfen?" });
    await waitFor(() => expect(route.guarded).toBe(true));
    await userEvent.click(within(dialog).getByRole("button", { name: "Eingabe verwerfen" }));
    await waitFor(() => expect(document.getElementById("measure-title")).toBeNull(), {
      timeout: 5_000,
    });
    await forwardOpensThenLeaves();
  }, 15_000);
}, 15_000);

/**
 * A save that keeps the measure view open (issue 2165): the form settles, and the history must not keep the guard entry the
 * typed input pushed. The measurement is saved with the form's own button, as a person does.
 */
describe("US-QS-15 a save that keeps the form open leaves no guard entry ahead (issue 2165)", () => {
  /** Types a measurement, waits for the guard entry to commit (PF-031), saves and waits for the saved toast. */
  async function typeAndSave(saves: string[]) {
    await userEvent.type(await screen.findByLabelText(/^Messwert/), "44");
    await waitFor(() => expect(route.guarded).toBe(true));
    await userEvent.click(screen.getByRole("button", { name: "Messung sichern" }));
    await waitFor(() => expect(saves).toHaveLength(1), { timeout: 5_000 });
    await waitFor(() => expect(document.body.textContent).toContain("Gesichert"), {
      timeout: 5_000,
    });
    // The settle commits the history in two steps (back to the list, then the form again); the test waits for the form.
    await waitFor(() => {
      expect(route.guarded).toBe(false);
      expect(route.search).toContain("form=measure");
    });
  }

  it("US-QS-15 a saved measurement that keeps the form open leaves no guard entry ahead: Forward reaches the form, a second Forward does nothing (issue 2165)", async () => {
    const saves: string[] = [];
    stubCollection(saves);
    renderAt("/collection?view=plants");
    await screen.findByRole("button", { name: /^Bogenhanf(\s|$)/ }, { timeout: 5_000 });
    await userEvent.click(await findCardButton("Messen: Bogenhanf"));
    const heading = await screen.findByRole("heading", { name: "Messen" });
    await typeAndSave(saves);
    // The save keeps the form on screen: it is the same heading, not one after a remount.
    expect(heading.isConnected).toBe(true);
    // Back from the form is one visible step to the list.
    back();
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Messen" })).toBeNull());
    forward();
    await waitFor(() => expect(route.search).toContain("form=measure"));
    expect(route.guarded).toBe(false);
    // Nothing is ahead of the form: a second Forward does nothing.
    forward();
    expect(route.guarded).toBe(false);
    expect(route.search).toContain("form=measure");
    expect(screen.getByRole("heading", { name: "Messen" })).toBeTruthy();
  }, 20_000);

  it("US-QS-15 after a save that keeps the form open, typing again arms the guard: Back asks before it leaves (issue 2165)", async () => {
    const saves: string[] = [];
    stubCollection(saves);
    renderAt("/collection?view=plants");
    await screen.findByRole("button", { name: /^Bogenhanf(\s|$)/ }, { timeout: 5_000 });
    await userEvent.click(await findCardButton("Messen: Bogenhanf"));
    await screen.findByRole("heading", { name: "Messen" });
    await typeAndSave(saves);
    await userEvent.type(screen.getByLabelText(/^Messwert/), "7");
    await waitFor(() => expect(route.guarded).toBe(true));
    back();
    await screen.findByRole("dialog", { name: "Eingabe verwerfen?" });
    // The question is modal, so the form is hidden from the accessibility tree: the form is found by its title element.
    expect(document.getElementById("measure-title")).not.toBeNull();
  }, 20_000);
});

/**
 * The focus and the announcements of the page from now on: every focus move and every change of the polite live region
 * (issue 2165). `stop` ends the watch.
 */
function watchFocusAndSpeech() {
  const focused: Element[] = [];
  const said: string[] = [];
  const live = document.querySelector<HTMLElement>('[aria-live="polite"]');
  const observer = new MutationObserver(() => said.push(live?.textContent ?? ""));
  if (live) observer.observe(live, { childList: true, characterData: true, subtree: true });
  const onFocus = (event: FocusEvent) => focused.push(event.target as Element);
  document.addEventListener("focusin", onFocus);
  return {
    focused,
    said,
    stop: () => {
      observer.disconnect();
      document.removeEventListener("focusin", onFocus);
    },
  };
}

/** The area with the page's focus handling and its announcer, as the app renders it (issue 2165). */
function renderFocusedArea() {
  render(
    <AnnouncerProvider>
      <MemoryRouter initialEntries={["/collection?view=plants"]}>
        <Address />
        <main id="inhalt" tabIndex={-1}>
          <RouteFocus titleOf={() => "Sammlung"} />
          <CollectionArea
            api="http://api"
            token={async () => "tok"}
            newSpecies={null}
            onSpeciesChoose={() => {}}
            onCompleted={() => {}}
          />
        </main>
      </MemoryRouter>
    </AnnouncerProvider>,
  );
}

describe("US-QS-15 a settle keeps the focus and announces no view (issue 2165)", () => {
  /** Opens the measure view and types a measurement; the guard entry is committed before the save (PF-031). */
  async function measureAndType() {
    await screen.findByRole("button", { name: /^Bogenhanf(\s|$)/ }, { timeout: 5_000 });
    await userEvent.click(await findCardButton("Messen: Bogenhanf"));
    await screen.findByRole("heading", { name: "Messen" });
    await userEvent.type(await screen.findByLabelText(/^Messwert/), "44");
    await waitFor(() => expect(route.guarded).toBe(true));
  }

  /** Saves with the form's button and waits until the form is on screen again with no guard entry (PF-031). */
  async function save(saves: string[]) {
    await userEvent.click(screen.getByRole("button", { name: "Messung sichern" }));
    await waitFor(() => expect(saves).toHaveLength(1), { timeout: 5_000 });
    await waitFor(() => {
      expect(route.guarded).toBe(false);
      expect(route.search).toContain("form=measure");
    });
  }

  it("US-QS-15 after a save that keeps the form open, the focus stays on the save button and no view title is announced (issue 2165)", async () => {
    const saves: string[] = [];
    stubCollection(saves);
    renderFocusedArea();
    await measureAndType();
    const saveButton = screen.getByRole("button", { name: "Messung sichern" });
    const watch = watchFocusAndSpeech();
    await save(saves);
    // The settle has committed; the focus handling of the new entries runs after the commit, so it gets a short moment.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    watch.stop();
    expect(document.activeElement).toBe(saveButton);
    // The press of the save button is the only focus event: the settle moves the focus nowhere.
    expect(watch.focused).toEqual([saveButton]);
    expect(watch.said.filter((text) => text.includes("Sammlung"))).toEqual([]);
  }, 20_000);

  it("US-QS-15 a Forward onto the form that the settle pushed again moves the focus to its heading, as any form entry does (issue 2165)", async () => {
    const saves: string[] = [];
    stubCollection(saves);
    renderFocusedArea();
    await measureAndType();
    await save(saves);
    back();
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Messen" })).toBeNull());
    // Back to the plant's layer moves the focus into it (US-QS-32).
    const layer = await screen.findByRole("dialog", { name: "Bogenhanf" });
    await waitFor(() => expect(layer.contains(document.activeElement)).toBe(true));
    const watch = watchFocusAndSpeech();
    forward();
    await waitFor(() => expect(document.activeElement?.id).toBe("measure-title"));
    watch.stop();
    expect(watch.said.some((text) => text.includes("Sammlung"))).toBe(true);
  }, 20_000);
});

describe("US-QS-15 every mode of the area is one screen (DS-61)", () => {
  it("US-QS-15 the measure view sits in the frame of the area, so at a large text size its content scrolls inside it", async () => {
    stubCollection();
    renderArea();
    await screen.findByRole("button", { name: /^Bogenhanf(\s|$)/ }, { timeout: 5_000 });
    await userEvent.click(await findCardButton("Messen: Bogenhanf"));
    const heading = await screen.findByRole("heading", { name: "Messen" });
    expect(heading.closest("[data-fit-screen]")).not.toBeNull();
  });

  it("US-QS-15 a form of a plant (the marker) sits in the frame of the area too", async () => {
    stubCollection();
    renderArea();
    await screen.findByRole("button", { name: /^Bogenhanf(\s|$)/ }, { timeout: 5_000 });
    await userEvent.click(await findCardButton("Kennzeichen ändern: Bogenhanf"));
    const heading = await screen.findByRole("heading", { name: "Kennzeichen ändern" });
    expect(heading.closest("[data-fit-screen]")).not.toBeNull();
  });
});

describe("US-ONB-09 the keeper's switches in the Sammlung", () => {
  it("US-ONB-09 a switched-off wishlist is not offered in the switch, and its address falls back to the plants", async () => {
    stubCollection();
    render(
      <MemoryRouter initialEntries={["/collection?view=wishlist"]}>
        <FeaturesProvider
          features={{
            social: true,
            ai: true,
            recommendations: true,
            wishlist: false,
            equipment: true,
          }}
        >
          <CollectionArea
            api="http://api"
            token={async () => "tok"}
            newSpecies={null}
            onSpeciesChoose={() => {}}
            onCompleted={() => {}}
          />
        </FeaturesProvider>
      </MemoryRouter>,
    );
    await screen.findByRole("button", { name: /^Bogenhanf(\s|$)/ }, { timeout: 5_000 });
    const switchGroup = screen.getByRole("group", { name: "Ansicht der Sammlung" });
    expect(within(switchGroup).queryByText("Wünsche")).toBeNull();
    expect(within(switchGroup).getByText("Geräte")).toBeTruthy();
  });
});

describe("US-BES-17 the entry to the pot labels", () => {
  const collection = (potLabels: boolean) => (
    <MemoryRouter initialEntries={["/collection?view=plants"]}>
      <FeaturesProvider features={{ pot_labels: potLabels }}>
        <CollectionArea
          api="http://api"
          token={async () => "tok"}
          newSpecies={null}
          onSpeciesChoose={() => {}}
          onCompleted={() => {}}
        />
      </FeaturesProvider>
    </MemoryRouter>
  );
  const openView = async () => {
    await screen.findByRole("button", { name: /^Bogenhanf(\s|$)/ }, { timeout: 5_000 });
    await userEvent.click(screen.getByRole("button", { name: "Ansicht" }));
    return screen.findByRole("dialog", { name: "Ansicht" });
  };

  it("US-BES-17 the layer Ansicht of the plants offers Etiketten drucken with the keeper switch on", async () => {
    stubCollection();
    render(collection(true));
    const layer = await openView();
    expect(
      within(layer).getByRole("link", { name: "Etiketten drucken" }).getAttribute("href"),
    ).toBe("/collection/labels");
  });

  it("US-BES-17 the entry adds no row to the title area of the Sammlung (US-QS-15)", async () => {
    stubCollection();
    render(collection(true));
    await screen.findByRole("button", { name: /^Bogenhanf(\s|$)/ }, { timeout: 5_000 });
    expect(screen.queryByRole("link", { name: "Etiketten drucken" })).toBeNull();
  });

  it("US-BES-17 the layer Ansicht offers no print with the keeper switch off (P-12)", async () => {
    stubCollection();
    render(collection(false));
    const layer = await openView();
    expect(within(layer).queryByRole("link", { name: "Etiketten drucken" })).toBeNull();
  });
});
