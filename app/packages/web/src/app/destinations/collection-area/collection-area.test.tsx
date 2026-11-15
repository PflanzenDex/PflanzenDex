// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { startTransition, useCallback, useLayoutEffect, useState, type ReactNode } from "react";
import {
  MemoryRouter,
  NavigationType,
  Router,
  UNSAFE_createMemoryHistory,
  useLocation,
  useNavigate,
  type Location,
  type NavigateFunction,
} from "react-router";
import { findCardButton } from "../../../collection/specimens/tests/plants-test-helpers";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CollectionArea } from "./collection-area";
import { RouteFocus } from "@/shared/platform/routing/route-focus/route-focus";
import { EMPTY_DISTRIBUTION } from "../../../collection/insights/distribution-test-helpers";
import { answerCardRead } from "../../../collection/specimens/tests/cards-fake";
import type { SpecimenCard } from "@pflanzendex/core";
import { FeaturesProvider } from "@/shared/data";
import {
  GUARD,
  stateFlag,
} from "../../../collection/plants-screen/plant-layers/plant-forms/address/form-address";

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

// The pages are lazy chunks (DS-08). Loading them first makes the waits below depend on the data only, not on how long
// the first import of a chunk takes on a busy machine (#444). The sheet's code is one of them: a layer's sheet asks for
// it 1.5 s after it mounts (sheet.tsx), and that first transform in the middle of a test stalled it for seconds (issue 2136).
beforeAll(async () => {
  await Promise.all([
    import("../../../collection/collection-page/collection-page"),
    import("../../../care/measure/measure-page/measure-page"),
    import("@/shared/ui/overlays/sheet/sheet-panel/sheet-panel"),
  ]);
}, 30_000);

afterEach(() => {
  cleanup();
  resetHold();
  vi.unstubAllGlobals();
});

/** The API of one plant (Bogenhanf) with its measurements, locations and archive. */
function stubCollection() {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url) => {
      const path = new URL(String(url)).pathname;
      if (path === "/locations") return response(200, { locations: [] });
      if (path === "/specimens/archived") return response(200, { archived: [] });
      if (path === "/specimens/distribution") return response(200, EMPTY_DISTRIBUTION);
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

describe("US-WAC-01 collection wired with measuring", () => {
  it("US-WAC-01 measuring on the specimen opens the measure view, back leads to the collection", async () => {
    stubCollection();
    renderArea();
    // The collection page is a lazy part; its first import can take longer than the default second under load.
    await screen.findByRole("button", { name: /^Bogenhanf / }, { timeout: 5_000 });
    await userEvent.click(await findCardButton("Messen: Bogenhanf"));
    expect(await screen.findByRole("heading", { name: "Messen: Bogenhanf" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Zurück zur Sammlung" }));
    expect(await screen.findByRole("heading", { name: "Sammlung" })).toBeTruthy();
  });
});

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

/**
 * The router of the tests of issue 2154: a MemoryRouter whose history changes can be held back. The real routers
 * apply a history change in a transition, so a question set at normal priority can be on screen while the guard entry
 * is still pending. While `hold.on` is set, a change that pushes or replaces an entry waits in `hold.queued`; a later
 * change replaces it, as the last update of a transition decides what renders. A back step applies at once and drops
 * the held change. `releaseHold` applies the held change in a transition. A suspending child would hold the transition
 * too, but inside `act` such a render never settled in these tests, so the hold does not suspend.
 */
type Routed = { action: NavigationType; location: Location };
const hold: { on: boolean; queued: Routed | null; apply: ((next: Routed) => void) | null } = {
  on: false,
  queued: null,
  apply: null,
};
function GatedRouter({ entry, children }: { entry: string; children: ReactNode }) {
  const [history] = useState(() =>
    UNSAFE_createMemoryHistory({ initialEntries: [entry], v5Compat: true }),
  );
  const [state, setStateImpl] = useState<Routed>({
    action: history.action,
    location: history.location,
  });
  const apply = useCallback((next: Routed) => startTransition(() => setStateImpl(next)), []);
  useLayoutEffect(() => {
    hold.apply = apply;
    // The layout effects of the children run before this one: the ordering of a form opened by its address may have
    // moved the history already. The router catches up with it, so the screen it shows is the entry the history is on.
    apply({ action: history.action, location: history.location });
    return history.listen((update) => {
      if (hold.on && update.action !== NavigationType.Pop) {
        hold.queued = update;
        return;
      }
      hold.queued = null;
      apply(update);
    });
  }, [history, apply]);
  return (
    <Router location={state.location} navigationType={state.action} navigator={history}>
      {children}
    </Router>
  );
}
/** Applies the held change in a transition, as the router would once the guard entry renders (issue 2154). */
async function releaseHold() {
  hold.on = false;
  const queued = hold.queued;
  hold.queued = null;
  await act(async () => {
    if (queued) hold.apply?.(queued);
    await Promise.resolve();
  });
}
/** Clears the hold between tests. */
function resetHold() {
  hold.on = false;
  hold.queued = null;
  hold.apply = null;
}
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

describe("US-QS-15 the forms of a plant are full views with an address", () => {
  it("US-WAC-01 Messen pushes an address with the plant, and Back closes the measure view", async () => {
    stubCollection();
    renderAt("/collection?view=plants");
    await screen.findByRole("button", { name: /^Bogenhanf / }, { timeout: 5_000 });
    await userEvent.click(await findCardButton("Messen: Bogenhanf"));
    await screen.findByRole("heading", { name: "Messen: Bogenhanf" });
    expect(route.search).toContain("form=measure");
    expect(route.search).toContain("plant=e1");
    back();
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Messen: Bogenhanf" })).toBeNull(),
    );
  });

  it("US-QS-15 Back from the measure view returns to the list and focuses the plant it was opened from", async () => {
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
    await screen.findByRole("button", { name: /^Bogenhanf / }, { timeout: 5_000 });
    // RouteFocus loads its focus module after the first paint (DS-08) and remembers the opener from then on.
    await userEvent.click(await findCardButton("Messen: Bogenhanf"));
    await screen.findByRole("heading", { name: "Messen: Bogenhanf" });
    back();
    await waitFor(
      () => expect(document.activeElement?.closest('ul[aria-label="Pflanzen"]')).not.toBeNull(),
      { timeout: 8_000 },
    );
    expect(screen.queryByRole("heading", { name: "Messen: Bogenhanf" })).toBeNull();
  }, 15_000);

  it("US-WAC-01 a reload at the address of the measure view opens it for that plant", async () => {
    stubCollection();
    renderAt("/collection?view=plants&form=measure&plant=e1");
    expect(
      await screen.findByRole("heading", { name: "Messen: Bogenhanf" }, { timeout: 5_000 }),
    ).toBeTruthy();
  });

  it("US-WAC-01 Back with typed measurement asks before it leaves; Weiter bearbeiten keeps the input", async () => {
    stubCollection();
    renderAt("/collection?view=plants&form=measure&plant=e1");
    await screen.findByRole("heading", { name: "Messen: Bogenhanf" }, { timeout: 5_000 });
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
    await screen.findByRole("heading", { name: "Messen: Bogenhanf" }, { timeout: 5_000 });
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
    await userEvent.click(within(dialog).getByRole("button", { name: "Verwerfen" }));
    await waitFor(() => expect(document.getElementById("measure-title")).toBeNull(), {
      timeout: 5_000,
    });
    expect(route.search).not.toContain("form=measure");
  });

  it("US-BES-03 the marker form asks before Back takes typed input, and closes when Verwerfen", async () => {
    stubCollection();
    renderAt("/collection?view=plants");
    await screen.findByRole("button", { name: /^Bogenhanf / }, { timeout: 5_000 });
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
    await userEvent.click(within(dialog).getByRole("button", { name: "Verwerfen" }));
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
    await screen.findByRole("heading", { name: "Messen: Bogenhanf" }, { timeout: 5_000 });
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
    await userEvent.click(within(dialog).getByRole("button", { name: "Verwerfen" }));
    await waitFor(() => expect(document.getElementById("measure-title")).toBeNull(), {
      timeout: 5_000,
    });
    expect(route.search).not.toContain("form=measure");
  });

  it("US-QS-15 two quick Backs with typed measurement, then Weiter bearbeiten, keep the input and the measure view", async () => {
    stubCollection();
    renderAt("/collection?view=plants&form=measure&plant=e1");
    await screen.findByRole("heading", { name: "Messen: Bogenhanf" }, { timeout: 5_000 });
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
    await screen.findByRole("heading", { name: "Messen: Bogenhanf" }, { timeout: 5_000 });
    await userEvent.type(await screen.findByLabelText(/^Messwert/), "44");
    await waitFor(() => expect(route.guarded).toBe(true));
    // The guard entry that Back pushes again stays pending while the question shows (a slow device, issue 2154).
    hold.on = true;
    back();
    const dialog = await screen.findByRole("dialog", { name: "Eingabe verwerfen?" });
    expect(route.guarded).toBe(false);
    await userEvent.click(within(dialog).getByRole("button", { name: "Verwerfen" }));
    await releaseHold();
    await waitFor(() => expect(document.getElementById("measure-title")).toBeNull(), {
      timeout: 5_000,
    });
    expect(route.search).not.toContain("form=measure");
  }, 15_000);

  it("US-QS-15 Back before the first guard entry commits still asks (issue 2154)", async () => {
    stubCollection();
    renderHeldAt("/collection?view=plants&form=measure&plant=e1");
    await screen.findByRole("heading", { name: "Messen: Bogenhanf" }, { timeout: 5_000 });
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
    await screen.findByRole("heading", { name: "Messen: Bogenhanf" }, { timeout: 5_000 });
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
    await userEvent.click(within(dialog).getByRole("button", { name: "Verwerfen" }));
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
    await screen.findByRole("button", { name: /^Bogenhanf / }, { timeout: 5_000 });
    await userEvent.click(await findCardButton("Messen: Bogenhanf"));
    await screen.findByRole("heading", { name: "Messen: Bogenhanf" });
    await userEvent.type(await screen.findByLabelText(/^Messwert/), "44");
    await waitFor(() => expect(route.guarded).toBe(true));
    back();
    const dialog = await screen.findByRole("dialog", { name: "Eingabe verwerfen?" });
    await waitFor(() => expect(route.guarded).toBe(true));
    await userEvent.click(within(dialog).getByRole("button", { name: "Verwerfen" }));
    await waitFor(() => expect(document.getElementById("measure-title")).toBeNull(), {
      timeout: 5_000,
    });
    await forwardOpensThenLeaves();
  }, 15_000);

  it("US-QS-15 Verwerfen after a Back with typed measurement leaves no guard entry ahead of a form opened by a reload (issue 2158)", async () => {
    stubCollection();
    renderAt("/collection?view=plants&form=measure&plant=e1");
    await screen.findByRole("heading", { name: "Messen: Bogenhanf" }, { timeout: 5_000 });
    await userEvent.type(await screen.findByLabelText(/^Messwert/), "44");
    await waitFor(() => expect(route.guarded).toBe(true));
    back();
    const dialog = await screen.findByRole("dialog", { name: "Eingabe verwerfen?" });
    await waitFor(() => expect(route.guarded).toBe(true));
    await userEvent.click(within(dialog).getByRole("button", { name: "Verwerfen" }));
    await waitFor(() => expect(document.getElementById("measure-title")).toBeNull(), {
      timeout: 5_000,
    });
    expect(route.search).not.toContain("form=measure");
    await forwardOpensThenLeaves();
  }, 15_000);

  it("US-QS-15 Verwerfen after the view's own back control with typed measurement leaves no guard entry ahead (issue 2158)", async () => {
    stubCollection();
    renderAt("/collection?view=plants");
    await screen.findByRole("button", { name: /^Bogenhanf / }, { timeout: 5_000 });
    await userEvent.click(await findCardButton("Messen: Bogenhanf"));
    await screen.findByRole("heading", { name: "Messen: Bogenhanf" });
    await userEvent.type(await screen.findByLabelText(/^Messwert/), "44");
    await waitFor(() => expect(route.guarded).toBe(true));
    await userEvent.click(screen.getByRole("button", { name: "Zurück zur Sammlung" }));
    const dialog = await screen.findByRole("dialog", { name: "Eingabe verwerfen?" });
    await waitFor(() => expect(route.guarded).toBe(true));
    await userEvent.click(within(dialog).getByRole("button", { name: "Verwerfen" }));
    await waitFor(() => expect(document.getElementById("measure-title")).toBeNull(), {
      timeout: 5_000,
    });
    await forwardOpensThenLeaves();
  }, 15_000);
});

describe("US-QS-15 every mode of the area is one screen (DS-61)", () => {
  it("US-QS-15 the measure view sits in the frame of the area, so at a large text size its content scrolls inside it", async () => {
    stubCollection();
    renderArea();
    await screen.findByRole("button", { name: /^Bogenhanf / }, { timeout: 5_000 });
    await userEvent.click(await findCardButton("Messen: Bogenhanf"));
    const heading = await screen.findByRole("heading", { name: "Messen: Bogenhanf" });
    expect(heading.closest("[data-fit-screen]")).not.toBeNull();
  });

  it("US-QS-15 a form of a plant (the marker) sits in the frame of the area too", async () => {
    stubCollection();
    renderArea();
    await screen.findByRole("button", { name: /^Bogenhanf / }, { timeout: 5_000 });
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
    await screen.findByRole("button", { name: /^Bogenhanf / }, { timeout: 5_000 });
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
    await screen.findByRole("button", { name: /^Bogenhanf / }, { timeout: 5_000 });
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
    await screen.findByRole("button", { name: /^Bogenhanf / }, { timeout: 5_000 });
    expect(screen.queryByRole("link", { name: "Etiketten drucken" })).toBeNull();
  });

  it("US-BES-17 the layer Ansicht offers no print with the keeper switch off (P-12)", async () => {
    stubCollection();
    render(collection(false));
    const layer = await openView();
    expect(within(layer).queryByRole("link", { name: "Etiketten drucken" })).toBeNull();
  });
});
