// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Species, Specimen, SpecimenCard } from "@pflanzendex/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CollectionPage } from "./CollectionPage";
import { EMPTY_DISTRIBUTION } from "./distribution-test-helpers";

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
  archivedAt: null,
  archivedReason: null,
  measurements: [],
  treatments: [],
  ...extra,
});
const cardFrom = (e: Specimen): SpecimenCard => ({
  id: e.id,
  name: e.name,
  speciesName: "Bogenhanf",
  status: e.status,
  location: e.locationId === "s1" ? "Regal Süd" : null,
  lightZone: null,
  caughtAt: e.caughtAt,
  photo: null,
  lastMeasurement: null,
  treatment: null,
  moreTreatments: 0,
});
const location = { id: "s1", name: "Regal Süd", lightZoneId: null, kind: "indoor" as const };

function fakeServer(opts: { specimens?: Specimen[]; create?: () => Promise<Response> } = {}) {
  const posts: { body: Record<string, unknown>; key: string | undefined }[] = [];
  const specimens = opts.specimens ?? [];
  const fetchFn = vi.fn<typeof fetch>(async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (init?.method === "POST" && path === "/specimens") {
      posts.push({
        body: JSON.parse(String(init.body)) as Record<string, unknown>,
        key: (init.headers as Record<string, string>)["Idempotency-Key"],
      });
      if (opts.create) return opts.create();
      const fresh = specimen({ id: "e2", name: "Bogenhanf – rot", marker: "rot" });
      specimens.push(fresh);
      return response(201, fresh);
    }
    if (path === "/locations") return response(200, { locations: [location] });
    if (path === "/specimens/archived") return response(200, { archived: [] });
    if (path === "/specimens/distribution") return response(200, EMPTY_DISTRIBUTION);
    return response(200, { cards: specimens.map(cardFrom) });
  });
  vi.stubGlobal("fetch", fetchFn);
  return { fetchFn, posts };
}

const page = (extra: Partial<Parameters<typeof CollectionPage>[0]> = {}) => (
  <CollectionPage
    api="http://api"
    token={async () => "tok"}
    newSpecies={null}
    onSpeciesChoose={vi.fn()}
    onCompleted={vi.fn()}
    {...extra}
  />
);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-BES-02 Seite Bestand", () => {
  it("shows a loading state first, then the specimens with location names", async () => {
    fakeServer({ specimens: [specimen({ locationId: "s1" })] });
    render(page());
    expect(screen.getByRole("status").textContent).toContain("Bestand wird geladen");
    expect(await screen.findByText("Standort: Regal Süd")).toBeTruthy();
  });

  it('without sign-in: error text and "Erneut laden" instead of an empty list (P-10)', async () => {
    const { fetchFn } = fakeServer();
    render(page({ token: async () => undefined }));
    expect((await screen.findByRole("alert")).textContent).toContain("Bitte melde dich neu an.");
    expect(fetchFn).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Erneut laden" })).toBeTruthy();
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
        return path === "/specimens/archived"
          ? response(200, { archived: [] })
          : response(200, { cards: [cardFrom(specimen())], ...EMPTY_DISTRIBUTION });
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
    await userEvent.click(screen.getByRole("button", { name: "Exemplar anlegen" }));
    await vi.waitFor(() => expect(onCompleted).toHaveBeenCalledOnce());
    expect(posts).toHaveLength(1);
    expect(posts[0]?.body).toMatchObject({ speciesId: "a1", marker: "rot", locationId: "s1" });
    expect(posts[0]?.key).toBeTruthy();
  });

  it("only the species is required: without a location it stays unknown and is not sent (P-08)", async () => {
    const { posts } = fakeServer();
    render(page({ newSpecies: species }));
    await userEvent.click(await screen.findByRole("button", { name: "Exemplar anlegen" }));
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
            text: "Ein Exemplar mit diesem Namen gibt es schon.",
            data: { name: "Bogenhanf", existing: [{ id: "e1", name: "Bogenhanf" }] },
          },
        }),
    });
    const onCompleted = vi.fn();
    render(page({ newSpecies: species, onCompleted }));
    await userEvent.click(await screen.findByRole("button", { name: "Exemplar anlegen" }));
    const box = await screen.findByRole("alert");
    expect(box.textContent).toContain("Ein Exemplar mit diesem Namen gibt es schon.");
    expect(box.textContent).toContain("Schon vorhanden: Bogenhanf");
    expect(onCompleted).not.toHaveBeenCalled();
    // Typing in a marker clears the error: the next input counts.
    await userEvent.type(screen.getByLabelText("Kennzeichen (optional)"), "r");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("the back button of the form leads to the species choice", async () => {
    fakeServer();
    const onSpeciesChoose = vi.fn();
    render(page({ newSpecies: species, onSpeciesChoose }));
    await userEvent.click(await screen.findByRole("button", { name: "Zurück zur Art" }));
    expect(onSpeciesChoose).toHaveBeenCalledOnce();
  });

  it("after creating with an unknown location the list says why it is unknown", async () => {
    fakeServer();
    const { rerender } = render(page({ newSpecies: species }));
    await userEvent.click(await screen.findByRole("button", { name: "Exemplar anlegen" }));
    await vi.waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "http://api/specimens",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    rerender(page({ newSpecies: null }));
    expect((await screen.findByRole("status")).textContent).toContain("ist angelegt");
    expect(screen.getByRole("status").textContent).toContain("Der Standort ist unbekannt");
  });
});

describe("US-BES-06 cards on the collection page", () => {
  it("shows measurement, note (collapsible), photo link and treatment from the cards API", async () => {
    const card: SpecimenCard = {
      ...cardFrom(specimen({ locationId: "s1" })),
      lightZone: "Zone 3",
      photo: { url: "https://medien.test/x.jpg", date: "2026-09-28" },
      lastMeasurement: { date: "2026-10-01", quality: "etiolated", note: "Streckt sich." },
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
        return path === "/specimens/archived"
          ? response(200, { archived: [] })
          : response(200, { cards: [card], ...EMPTY_DISTRIBUTION });
      }),
    );
    render(page());
    expect(await screen.findByText("Lichtzone: Zone 3 · Status: Pflanze")).toBeTruthy();
    const photo = screen.getByRole("link", { name: "Foto von Bogenhanf groß öffnen" });
    expect(photo.getAttribute("href")).toBe("https://medien.test/x.jpg");
    expect(screen.getByText(/kein Erfolgssignal/)).toBeTruthy();
    expect(screen.getByText("überfällig seit 1 Tg.")).toBeTruthy();
    expect(screen.getByText(/\+2 weitere/)).toBeTruthy();
    const details = screen.getByText("Notiz der Messung").closest("details");
    expect(details?.open).toBe(false);
    await userEvent.click(screen.getByText("Notiz der Messung"));
    expect(details?.open).toBe(true);
    expect(screen.getByText("Streckt sich.")).toBeTruthy();
  });
});
