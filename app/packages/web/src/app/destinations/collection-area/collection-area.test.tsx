// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
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

// Both pages are lazy chunks (DS-08). Loading them first makes the waits below depend on the data only, not on how
// long the first import of a chunk takes on a busy machine (#444).
beforeAll(async () => {
  await Promise.all([
    import("../../../collection/collection-page/collection-page"),
    import("../../../care/measure/measure-page/measure-page"),
  ]);
}, 30_000);

afterEach(() => {
  cleanup();
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
const route: { navigate: NavigateFunction | null; search: string } = { navigate: null, search: "" };
function Address() {
  const navigate = useNavigate();
  const location = useLocation();
  route.navigate = navigate;
  route.search = location.search;
  return null;
}
const back = () => act(() => route.navigate?.(-1));
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
    back();
    const dialog = await screen.findByRole("dialog", { name: "Eingabe verwerfen?" });
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
    back();
    const dialog = await screen.findByRole("dialog", { name: "Eingabe verwerfen?" });
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
