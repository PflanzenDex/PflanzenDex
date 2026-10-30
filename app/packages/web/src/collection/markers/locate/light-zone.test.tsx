// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SpecimenCard } from "@pflanzendex/core";
import { MemoryRouter } from "react-router";
import { findCardButton, openPlant, openTab } from "../../specimens/tests/plants-test-helpers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CollectionPage } from "../../collection-page/collection-page";
import { EMPTY_DISTRIBUTION } from "../../insights/distribution-test-helpers";
import { setLightZone } from "../../specimens/model/specimens-api";

// US-LIC-02 / US-BES-04: the own light zone of an EXISTING specimen is set, changed and cleared on its card.
const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const zones = [
  { id: "z2", name: "Lampe 2" },
  { id: "z3", name: "Lampe 3" },
];
const card = (extra: Partial<SpecimenCard> = {}): SpecimenCard => ({
  id: "e1",
  name: "Bogenhanf",
  speciesId: "a1",
  marker: null,
  speciesName: "Bogenhanf",
  status: "plant",
  location: "Regal",
  lightZone: "Lampe 2",
  lightZoneSource: "location",
  caughtAt: "2026-10-03",
  photo: null,
  lastMeasurement: null,
  treatment: null,
  provenance: null,
  moreTreatments: 0,
  ...extra,
});

type Post = { path: string; body: Record<string, unknown>; key: string | undefined };

/** Fake server: `POST /specimens/<id>/light-zone` is answered by `answer`, then the cards read as `after`. */
function fakeServer(state: {
  cards: SpecimenCard[];
  after?: SpecimenCard[];
  answer?: () => Promise<Response>;
  zonesFail?: boolean;
}) {
  const posts: Post[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (init?.method === "POST") {
        posts.push({
          path,
          body: JSON.parse(String(init.body)) as Record<string, unknown>,
          key: (init.headers as Record<string, string>)["Idempotency-Key"],
        });
        const r = await (state.answer ?? (() => response(200, { id: "e1" })))();
        if (r.ok && state.after) state.cards = state.after;
        return r;
      }
      if (path === "/light-zones")
        return state.zonesFail ? response(500, {}) : response(200, { zones });
      if (path === "/locations") return response(200, { locations: [] });
      if (path === "/specimens/archived") return response(200, { archived: [] });
      if (path === "/specimens/distribution") return response(200, EMPTY_DISTRIBUTION);
      return response(200, { cards: state.cards });
    }),
  );
  return posts;
}

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
const open = async () => userEvent.click(await findCardButton("Lichtzone ändern: Bogenhanf"));
const select = async () => (await screen.findByLabelText("Eigene Lichtzone")) as HTMLSelectElement;
const save = () => userEvent.click(screen.getByRole("button", { name: "Lichtzone speichern" }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-LIC-02 US-BES-04 client of the light zone API", () => {
  it("posts the zone ID, or null to clear, with a fresh repeat-guard key", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => response(200, { id: "e 1" }));
    await setLightZone("http://api", "tok", { id: "e 1", lightZoneId: null }, fetchFn);
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://api/specimens/e%201/light-zone");
    expect(JSON.parse(String(init?.body))).toEqual({ lightZoneId: null });
    expect((init?.headers as Record<string, string>)["Idempotency-Key"]).toBeTruthy();
  });
});

describe("US-LIC-02 US-BES-04 set the own light zone of an existing specimen", () => {
  it("US-LIC-02 offers the own zones plus 'derive', sets the chosen one and says what changed", async () => {
    const posts = fakeServer({
      cards: [card()],
      after: [card({ lightZone: "Lampe 3", lightZoneSource: "specimen" })],
    });
    render(page());
    await open();
    expect(screen.getByRole("heading", { name: "Lichtzone ändern" })).toBeTruthy();
    const field = await select();
    await vi.waitFor(() => expect(within(field).getAllByRole("option")).toHaveLength(3));
    expect(field.value).toBe("");
    await userEvent.selectOptions(field, "z3");
    await save();
    await vi.waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({
      path: "/specimens/e1/light-zone",
      body: { lightZoneId: "z3" },
    });
    expect(posts[0]?.key).toBeTruthy();
    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("„Bogenhanf“ ist jetzt „Lampe 3“");
    await openPlant("Bogenhanf");
    await openTab("Standort");
    expect(await screen.findByText(/Lampe 3 \(von dir für diese Pflanze gesetzt\)/)).toBeTruthy();
  });

  it("US-LIC-02 starts at the current own zone", async () => {
    fakeServer({ cards: [card({ lightZone: "Lampe 3", lightZoneSource: "specimen" })] });
    render(page());
    await open();
    await vi.waitFor(async () => expect((await select()).value).toBe("z3"));
  });

  it("US-LIC-02 clearing goes back to the derived zone and names it", async () => {
    const posts = fakeServer({
      cards: [card({ lightZone: "Lampe 3", lightZoneSource: "specimen" })],
      after: [card({ lightZone: "Lampe 2", lightZoneSource: "location" })],
    });
    render(page());
    await open();
    const field = await select();
    await vi.waitFor(() => expect(field.value).toBe("z3"));
    await userEvent.selectOptions(field, "");
    await save();
    await vi.waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]?.body).toEqual({ lightZoneId: null });
    expect((await screen.findByRole("status")).textContent).toContain(
      "Es gilt wieder die abgeleitete Zone: Lampe 2 (vom Standort).",
    );
  });

  it("US-LIC-02 clearing with nothing derivable says so and what to do next (P-08, P-09)", async () => {
    fakeServer({
      cards: [card({ lightZone: "Lampe 3", lightZoneSource: "specimen" })],
      after: [card({ lightZone: null, lightZoneSource: null })],
    });
    render(page());
    await open();
    const field = await select();
    await vi.waitFor(() => expect(field.value).toBe("z3"));
    await userEvent.selectOptions(field, "");
    await save();
    const text = (await screen.findByRole("status")).textContent ?? "";
    expect(text).toContain("unbekannt");
    expect(text).toContain("Weise dem Standort eine Lichtzone zu");
  });

  it("US-BES-04 a cutting keeps its cutting light and the message says when the zone applies", async () => {
    fakeServer({
      cards: [card({ status: "cutting", lightZone: "Lampe 1", lightZoneSource: "cutting" })],
    });
    render(page());
    await open();
    expect(screen.getByText(/Ein Steckling steht unter Stecklingslicht/)).toBeTruthy();
    const field = await select();
    await vi.waitFor(() => expect(within(field).getAllByRole("option")).toHaveLength(3));
    await userEvent.selectOptions(field, "z2");
    await save();
    expect((await screen.findByRole("status")).textContent).toContain(
      "Stecklingslicht; die Zone gilt, sobald du es eintopfst",
    );
  });

  it("US-LIC-02 a refusal stays in the form with its German text and nothing is reported as changed (P-10)", async () => {
    fakeServer({
      cards: [card()],
      answer: () =>
        response(404, {
          error: { code: "light_zone.not_found", text: "Diese Lichtzone gibt es nicht." },
        }),
    });
    render(page());
    await open();
    const field = await select();
    await vi.waitFor(() => expect(within(field).getAllByRole("option")).toHaveLength(3));
    await userEvent.selectOptions(field, "z3");
    await save();
    expect((await screen.findByRole("alert")).textContent).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Lichtzone ändern" })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("US-LIC-02 zones that cannot be loaded are said so, not hidden (P-10)", async () => {
    fakeServer({ cards: [card()], zonesFail: true });
    render(page());
    await open();
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Die Lichtzonen konnten nicht geladen werden",
    );
  });

  it("US-LIC-02 cancel goes back to the list without a request", async () => {
    const posts = fakeServer({ cards: [card()] });
    render(page());
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(await findCardButton("Lichtzone ändern: Bogenhanf")).toBeTruthy();
    expect(posts).toHaveLength(0);
  });
});
