// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Species, Specimen, SpecimenCard } from "@pflanzendex/core";
import { MemoryRouter, useLocation } from "react-router";
import { openPlant, openTab } from "../specimens/tests/plants-test-helpers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { CollectionPage } from "./collection-page";
import { EMPTY_DISTRIBUTION } from "../insights/distribution-test-helpers";
import { answerCardRead } from "../specimens/tests/cards-fake";
import { delayLoads } from "@/shared/ui/skeleton.loading-contract";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const species = {
  id: "a1",
  latinName: "Dracaena trifasciata",
  germanName: "Bogenhanf",
} as Species;
const specimen = (extra: Partial<Specimen> = {}): Specimen => ({
  id: "e1",
  speciesId: "a1",
  name: "Bogenhanf",
  marker: null,
  locationId: null,
  status: "plant",
  caughtAt: "2026-10-03",
  createdAt: "2026-10-03T08:00:00Z",
  archivedAt: null,
  archivedReason: null,
  measurements: [],
  treatments: [],
  ...extra,
});
const cardFrom = (e: Specimen): SpecimenCard => ({
  id: e.id,
  name: e.name,
  speciesId: e.speciesId,
  marker: e.marker,
  speciesName: "Bogenhanf",
  status: e.status,
  location: e.locationId === "s1" ? "Regal Süd" : null,
  lightZone: null,
  lightZoneSource: null,
  lightNeedUnknown: false,
  caughtAt: e.caughtAt,
  photo: null,
  lastMeasurement: null,
  treatment: null,
  provenance: null,
  moreTreatments: 0,
});
const location = { id: "s1", name: "Regal Süd", lightZoneId: null, kind: "indoor" as const };

type ServerOptions = {
  specimens?: Specimen[];
  create?: () => Promise<Response>;
  /** Answers a request before the default answers (a failing page, for example); `null` leaves it to the default. */
  answer?: (url: URL) => Promise<Response> | null;
};

function fakeServer(opts: ServerOptions = {}) {
  const posts: { body: Record<string, unknown>; key: string | undefined }[] = [];
  const specimens = opts.specimens ?? [];
  const fetchFn = vi.fn<typeof fetch>(async (url, init) => {
    const u = new URL(String(url));
    const path = u.pathname;
    if (init?.method === "POST" && path === "/specimens") {
      posts.push({
        body: JSON.parse(String(init.body)) as Record<string, unknown>,
        key: (init.headers as Record<string, string>)["Idempotency-Key"],
      });
      if (opts.create) return opts.create();
      // An id many() never produces, so the list keys stay unique (#1627).
      const fresh = specimen({ id: "new-1", name: "Bogenhanf – rot", marker: "rot" });
      specimens.push(fresh);
      return response(201, fresh);
    }
    const own = opts.answer?.(u);
    if (own) return own;
    if (path === "/locations") return response(200, { locations: [location] });
    if (path === "/specimens/archived") return response(200, { archived: [] });
    if (path === "/specimens/distribution") return response(200, EMPTY_DISTRIBUTION);
    return answerCardRead(u, specimens.map(cardFrom)) ?? response(404, {});
  });
  vi.stubGlobal("fetch", fetchFn);
  return { fetchFn, posts };
}

/** The requests of the card list (`/specimens/cards`) that the page sent, as URLs. */
const cardCalls = (fetchFn: ReturnType<typeof vi.fn<typeof fetch>>) =>
  fetchFn.mock.calls
    .map(([url]) => new URL(String(url)))
    .filter((u) => u.pathname === "/specimens/cards");

/** One hundred and more plants with names that sort in the order of their numbers (FR-BES-23). */
const many = (n: number, locationId: string | null = "s1") =>
  Array.from({ length: n }, (_, i) =>
    specimen({
      id: `e${i + 1}`,
      name: `Pflanze ${String(i + 1).padStart(3, "0")}`,
      locationId,
    }),
  );

const page = (extra: Partial<Parameters<typeof CollectionPage>[0]> = {}, at = "/") => (
  <MemoryRouter initialEntries={[at]}>
    <CollectionPage
      api="http://api"
      token={async () => "tok"}
      newSpecies={null}
      onSpeciesChoose={vi.fn()}
      onCompleted={vi.fn()}
      {...extra}
    />
  </MemoryRouter>
);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-BES-02 Seite Sammlung", () => {
  it("shows a loading state first, then the specimens with location names", async () => {
    fakeServer({ specimens: [specimen({ locationId: "s1" })] });
    delayLoads();
    render(page());
    expect((await screen.findByRole("status")).textContent).toContain("Sammlung wird geladen");
    await openPlant("Bogenhanf");
    await openTab("Standort");
    expect(await screen.findByText("Standort: Regal Süd")).toBeTruthy();
  });

  it('without sign-in: error text and "Erneut versuchen" instead of an empty list (P-10)', async () => {
    const { fetchFn } = fakeServer();
    render(page({ token: async () => undefined }));
    expect((await screen.findByRole("alert")).textContent).toContain("Bitte melde dich neu an.");
    expect(fetchFn).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
  });

  it("if one of the two queries fails, nothing is shown half", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url) => {
        const path = new URL(String(url)).pathname;
        if (path === "/locations")
          return response(500, {
            error: { code: "server.error", text: "Standorte nicht ladbar." },
          });
        if (path === "/specimens/archived") return response(200, { archived: [] });
        if (path === "/specimens/distribution") return response(200, EMPTY_DISTRIBUTION);
        return answerCardRead(new URL(String(url)), [cardFrom(specimen())]) ?? response(404, {});
      }),
    );
    render(page());
    expect((await screen.findByRole("alert")).textContent).toContain("Standorte nicht ladbar.");
    expect(screen.queryByText("Bogenhanf")).toBeNull();
  });

  it("with a chosen species: creates the specimen with marker and location and reports completion", async () => {
    const { posts } = fakeServer();
    const onCompleted = vi.fn();
    render(page({ newSpecies: species, onCompleted }));
    expect(await screen.findByText("Name: Bogenhanf")).toBeTruthy();
    await userEvent.type(screen.getByLabelText("Kennzeichen (optional)"), "rot");
    expect(screen.getByText("Name: Bogenhanf – rot")).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText("Standort"), "s1");
    await userEvent.click(screen.getByRole("button", { name: "Pflanze anlegen" }));
    await vi.waitFor(() => expect(onCompleted).toHaveBeenCalledOnce());
    expect(posts).toHaveLength(1);
    expect(posts[0]?.body).toMatchObject({ speciesId: "a1", marker: "rot", locationId: "s1" });
    expect(posts[0]?.key).toBeTruthy();
  });

  it("only the species is required: without a location it stays unknown and is not sent (P-08)", async () => {
    const { posts } = fakeServer();
    render(page({ newSpecies: species }));
    await userEvent.click(await screen.findByRole("button", { name: "Pflanze anlegen" }));
    await vi.waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]?.body["locationId"]).toBeUndefined();
    expect(posts[0]?.body["marker"]).toBeUndefined();
  });

  it("a taken name stays in the form with error, existing specimens and call to action", async () => {
    fakeServer({
      create: () =>
        response(409, {
          error: {
            code: "specimen.name_taken",
            text: "Eine Pflanze mit diesem Namen gibt es schon.",
            data: { name: "Bogenhanf", existing: [{ id: "e1", name: "Bogenhanf" }] },
          },
        }),
    });
    const onCompleted = vi.fn();
    render(page({ newSpecies: species, onCompleted }));
    await userEvent.click(await screen.findByRole("button", { name: "Pflanze anlegen" }));
    const box = await screen.findByRole("alert");
    expect(box.textContent).toContain("Eine Pflanze mit diesem Namen gibt es schon.");
    expect(box.textContent).toContain("Schon vorhanden: Bogenhanf");
    expect(onCompleted).not.toHaveBeenCalled();
    // Typing in a marker clears the error: the next input counts.
    await userEvent.type(screen.getByLabelText("Kennzeichen (optional)"), "r");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("US-QS-32 · SG-SHEET-04 Abbrechen in the bar of the form leads to the species choice, as the back button did", async () => {
    fakeServer();
    const onSpeciesChoose = vi.fn();
    render(page({ newSpecies: species, onSpeciesChoose }));
    await userEvent.click(await screen.findByRole("button", { name: "Abbrechen" }));
    expect(onSpeciesChoose).toHaveBeenCalledOnce();
  });

  it("US-ONB-01 Pflanze anlegen (the plus) opens the quick flow, not the species choice", async () => {
    fakeServer({ specimens: [specimen()] });
    const [onAdd, onSpeciesChoose] = [vi.fn(), vi.fn()];
    render(page({ onAdd, onSpeciesChoose }));
    await userEvent.click(await screen.findByRole("button", { name: "Pflanze anlegen" }));
    expect(onAdd).toHaveBeenCalledOnce();
    expect(onSpeciesChoose).not.toHaveBeenCalled();
  });

  it("US-BES-02 after creating with an unknown location the toast says why it is unknown (issue 1644, F8)", async () => {
    fakeServer();
    const { rerender } = render(page({ newSpecies: species }));
    await userEvent.click(await screen.findByRole("button", { name: "Pflanze anlegen" }));
    await vi.waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "http://api/specimens",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    rerender(page({ newSpecies: null }));
    // The result is a toast with role=status above the page, not a note inserted above the list (US-QS-07, DS-54, issue 1644).
    const toast = await screen.findByRole("status");
    expect(toast.textContent).toContain("ist angelegt");
    expect(toast.textContent).toContain("Der Standort ist unbekannt");
  });
});

/** The classes of every padded ancestor of an element: a page frame (px-4, py-6) around it, if there is one (US-QS-32). */
function paddedAncestors(el: HTMLElement): string[] {
  const found: string[] = [];
  for (let node = el.parentElement; node; node = node.parentElement) {
    if (/(^|\s)px-4(\s|$)/.test(node.className) || /(^|\s)py-6(\s|$)/.test(node.className))
      found.push(node.className);
  }
  return found;
}

describe("US-QS-32 the page hosted by Sammlung has no frame of its own", () => {
  it("US-QS-32 with a host the list group sits without a padded frame, so it starts at the destination's gutter", async () => {
    fakeServer({ specimens: [specimen({ locationId: "s1" })] });
    render(page({ host: { onCaption: vi.fn(), onFullView: vi.fn() } }));
    const list = await screen.findByRole("list", { name: "Pflanzen" });
    expect(paddedAncestors(list)).toEqual([]);
  });

  it("US-QS-32 with a host the loading skeleton has no padded frame either, so it lines up with the list", async () => {
    fakeServer({ specimens: [specimen({ locationId: "s1" })] });
    delayLoads();
    render(page({ host: { onCaption: vi.fn(), onFullView: vi.fn() } }));
    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("Sammlung wird geladen");
    expect(paddedAncestors(status)).toEqual([]);
  });

  it("US-QS-32 without a host the page keeps its own frame (PageFrame: px-4 and py-6 around the list)", async () => {
    fakeServer({ specimens: [specimen({ locationId: "s1" })] });
    render(page());
    const list = await screen.findByRole("list", { name: "Pflanzen" });
    const frames = paddedAncestors(list);
    expect(frames.some((c) => /(^|\s)px-4(\s|$)/.test(c) && /(^|\s)py-6(\s|$)/.test(c))).toBe(true);
  });
});

describe("US-BES-06 cards on the collection page", () => {
  it("shows measurement, note (collapsible), photo link and treatment from the cards API", async () => {
    const card: SpecimenCard = {
      ...cardFrom(specimen({ locationId: "s1" })),
      lightZone: "Zone 3",
      lightZoneSource: "location",
      lightNeedUnknown: false,
      photo: { url: "/specimens/e1/measurements/m1/photo", date: "2026-09-28" },
      lastMeasurement: {
        date: "2026-10-01",
        value: 12.5,
        quality: "etiolated",
        note: "Streckt sich.",
      },
      treatment: {
        reason: "Neem spritzen",
        dueDate: { kind: "overdue", days: 1, text: "überfällig seit 1 Tg." },
      },
      moreTreatments: 2,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url) => {
        const path = new URL(String(url)).pathname;
        if (path === "/locations") return response(200, { locations: [location] });
        if (path.endsWith("/photo")) return new Response(new Uint8Array([1]), { status: 200 });
        if (path === "/specimens/archived") return response(200, { archived: [] });
        if (path === "/specimens/distribution") return response(200, EMPTY_DISTRIBUTION);
        return answerCardRead(new URL(String(url)), [card]) ?? response(404, {});
      }),
    );
    URL.createObjectURL = vi.fn(() => "blob:card");
    render(page());
    await openPlant("Bogenhanf");
    expect(await screen.findByText("Art: Bogenhanf · Status: Pflanze")).toBeTruthy();
    const photo = await screen.findByRole("link", { name: "Foto von Bogenhanf groß öffnen" });
    expect(photo.getAttribute("href")).toBe("blob:card");
    expect(screen.getByText(/kein Erfolgssignal/)).toBeTruthy();
    expect(screen.getByText("1 Tag überfällig")).toBeTruthy();
    expect(screen.getByText(/\+2 weitere/)).toBeTruthy();
    const details = screen.getByText("Notiz der Messung").closest("details");
    expect(details?.open).toBe(false);
    await userEvent.click(screen.getByText("Notiz der Messung"));
    expect(details?.open).toBe(true);
    expect(screen.getByText("Streckt sich.")).toBeTruthy();
  });
});

// US-BES-06 · FR-BES-23 · NFR-12: the list reads its plants in pages of 100 from the server; the total and every reader
// that speaks about all plants use the server's answer, never the loaded page (P-10).
describe("US-BES-06 · FR-BES-23 the server list of the collection page scrolls and loads more by itself", () => {
  // The list is one scrolling list at every width (US-QS-15, SG-LIST-01): no pages, no position in the address. Without an
  // IntersectionObserver (jsdom) every part is asked for at once, one after the other.
  beforeEach(() => setViewportWidth(1024));
  afterEach(() => setViewportWidth(360));

  const plants = () => screen.getByRole("list", { name: "Pflanzen" });
  /** The plant rows of the list, without the loader, retry and end rows at its end (counted on the list, no role query). */
  const rows = () => plants().querySelectorAll(":scope > li:not([data-list-end])");

  it("US-QS-15 · FR-BES-23 every plant of the server total ends up on the one list, with no Zurück, Weiter or page position", async () => {
    const { fetchFn } = fakeServer({ specimens: many(150) });
    render(page());
    expect(await screen.findByRole("button", { name: /^Pflanze 150(\s|$)/ })).toBeTruthy();
    expect(plants().querySelectorAll(":scope > li:not([data-list-end])")).toHaveLength(150);
    expect(screen.queryByRole("button", { name: /^(Zurück|Weiter)$/ })).toBeNull();
    expect(screen.queryByText(/^Seite \d+ von \d+$/)).toBeNull();
    expect(cardCalls(fetchFn).some((u) => u.searchParams.has("after"))).toBe(true);
  });

  it("US-QS-15 · SG-NAV-02 an old position in the address (?from=144) is not used: the list starts at its first plant, and the address loses it", async () => {
    fakeServer({ specimens: many(150) });
    function Address() {
      return <span data-testid="address">{useLocation().search}</span>;
    }
    render(
      <MemoryRouter initialEntries={["/?from=144"]}>
        <CollectionPage
          api="http://api"
          token={async () => "tok"}
          newSpecies={null}
          onSpeciesChoose={vi.fn()}
          onCompleted={vi.fn()}
        />
        <Address />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("button", { name: /^Pflanze 001(\s|$)/ })).toBeTruthy();
    await vi.waitFor(() => expect(screen.getByTestId("address").textContent).toBe(""));
  });

  it("P-10 FR-BES-23 a further part that fails keeps the loaded plants; Erneut versuchen continues from the same cursor", async () => {
    let failed = false;
    // One part holds one hundred plants (FR-BES-23), so one plant more is a second part that has to be asked for.
    const { fetchFn } = fakeServer({
      specimens: many(101),
      answer: (u) => {
        if (u.pathname !== "/specimens/cards" || !u.searchParams.has("after") || failed)
          return null;
        failed = true;
        return response(500, {
          error: { code: "server.error", text: "Die Pflanzen konnten nicht geladen werden." },
        });
      },
    });
    render(page());
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Die Pflanzen konnten nicht geladen werden.",
    );
    expect(rows()).toHaveLength(100);
    expect(screen.getByText("Pflanze 001")).toBeTruthy();
    // The retry row can be swapped for the loader for a moment (the held loader of useHeldLoader), and a click on a button
    // that has left the page is lost. So the button is found and clicked in one step; the step waits until the button is there.
    await waitFor(() => fireEvent.click(screen.getByText("Erneut versuchen")));
    expect(await screen.findByText("Pflanze 101")).toBeTruthy();
    expect(rows()).toHaveLength(101);
    const cursors = cardCalls(fetchFn)
      .map((u) => u.searchParams.get("after"))
      .filter((after): after is string => after !== null);
    expect(cursors.length).toBeGreaterThanOrEqual(2);
    expect(new Set(cursors).size).toBe(1);
  });

  it("P-10 FR-BES-23 a further part that fails without an error text still shows the failure and asks only once", async () => {
    const { fetchFn } = fakeServer({
      specimens: many(150),
      answer: (u) =>
        u.pathname === "/specimens/cards" && u.searchParams.has("after")
          ? response(502, { error: { code: "proxy.bad_gateway" } })
          : null,
    });
    render(page());
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Die Pflanzen konnten nicht geladen werden.",
    );
    expect(cardCalls(fetchFn).filter((u) => u.searchParams.has("after"))).toHaveLength(1);
  });

  it("US-ONB-07 · US-QS-32 · FR-BES-23 the list of plants shows no calm hint any more, also for a plant without a place beyond the first page (its hints are in the plant layer)", async () => {
    fakeServer({
      specimens: [...many(100), specimen({ id: "ezz", name: "Zzz Ohne Ort", locationId: null })],
    });
    render(page());
    expect(await screen.findByRole("button", { name: /Pflanze 001/ })).toBeTruthy();
    expect(screen.queryByRole("status", { name: "Hinweis" })).toBeNull();
    expect(screen.queryByText(/Hinweis|plant_without_place/)).toBeNull();
  });

  it("US-BES-03 · FR-BES-23 the other specimens of a species come from the species filter, not from the loaded page", async () => {
    const others = Array.from({ length: 100 }, (_, i) =>
      specimen({
        id: `o${i}`,
        speciesId: "a2",
        name: `Aaa ${String(i).padStart(3, "0")}`,
        locationId: "s1",
      }),
    );
    const sibling = specimen({ id: "z1", speciesId: "a1", name: "Zzz Eins", locationId: "s1" });
    const { fetchFn } = fakeServer({ specimens: [...others, sibling] });
    render(page({ newSpecies: species }));
    // One other specimen of the species exists, beyond the first page: the marker is required.
    expect(await screen.findByLabelText("Kennzeichen")).toBeTruthy();
    const ofSpecies = cardCalls(fetchFn).filter((u) => u.searchParams.get("species") === "a1");
    expect(ofSpecies.length).toBeGreaterThan(0);
    expect(ofSpecies[0]?.searchParams.get("limit")).toBe("200");
  });

  it("FR-BES-23 the caption of the host names the total of all plants, not the loaded ones", async () => {
    fakeServer({ specimens: many(150) });
    const host = { onCaption: vi.fn(), onFullView: vi.fn() };
    render(page({ host }));
    await vi.waitFor(() => expect(host.onCaption).toHaveBeenLastCalledWith("150 Pflanzen"));
  });

  it("FR-BES-23 after a write the total is refreshed: the list follows the new total", async () => {
    const { posts } = fakeServer({ specimens: many(144) });
    const { rerender } = render(page({ newSpecies: { ...species, id: "a9" } as Species }));
    await userEvent.click(await screen.findByRole("button", { name: "Pflanze anlegen" }));
    await vi.waitFor(() => expect(posts).toHaveLength(1));
    rerender(page());
    expect(await screen.findByRole("button", { name: /^Pflanze 144(\s|$)/ })).toBeTruthy();
  });

  it("US-BES-06 · FR-BES-23 a direct link to a plant that is not loaded opens its layer", async () => {
    fakeServer({ specimens: many(150) });
    render(page({}, "/?sheet=plant-e150"));
    expect(await screen.findByRole("heading", { name: "Pflanze 150" })).toBeTruthy();
  });

  it("P-10 a direct link to a plant that does not exist shows the error state with Erneut versuchen", async () => {
    fakeServer({ specimens: many(3) });
    render(page({}, "/?sheet=plant-gibt-es-nicht"));
    expect(await screen.findByText("Diese Pflanze gibt es nicht.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
  });
});
