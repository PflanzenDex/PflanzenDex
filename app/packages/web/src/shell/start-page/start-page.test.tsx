// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StartPage } from "./start-page";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";
const ZONES = [
  { id: "z1", name: "Stecklingslicht", luxCeiling: 5000, ppfd: null, sortOrder: 1 },
  { id: "z2", name: "Lampe 2", luxCeiling: 15000, ppfd: null, sortOrder: 2 },
  { id: "z3", name: "Lampe 3", luxCeiling: 30000, ppfd: null, sortOrder: 3 },
  { id: "z4", name: "Lampe 4", luxCeiling: 60000, ppfd: null, sortOrder: 4 },
];
const HIT = { id: "sp1", latinName: "Monstera deliciosa", germanName: "Fensterblatt" };
const SPECIES = { ...HIT, lightDemandLux: 12000, standardLevel: 2, softLeaf: false };

interface World {
  zones: unknown[];
  cards: unknown[];
  archived?: number;
  hits?: unknown[];
  writes: { method: string; path: string; body: Record<string, unknown> }[];
}

function fakeServer(w: World) {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const u = new URL(String(url));
      const method = init?.method ?? "GET";
      if (method !== "GET") {
        const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
        w.writes.push({ method, path: u.pathname, body });
        if (u.pathname === "/light-zones/defaults") {
          w.zones = ZONES;
          return response(201, { zones: ZONES });
        }
        if (u.pathname === "/specimens") return response(201, { id: "e1", speciesId: "sp1" });
        return response(404, {});
      }
      if (u.pathname === "/light-zones") return response(200, { zones: w.zones });
      if (u.pathname === "/species") return response(200, { species: w.hits ?? [HIT] });
      if (u.pathname === "/species/sp1") return response(200, SPECIES);
      if (u.pathname === "/specimens/count")
        return response(200, { count: w.cards.length, archived: w.archived ?? 0 });
      return response(404, {});
    }),
  );
}

const get = async (url: string) => {
  const r = await fetch(url, { headers: { Authorization: "Bearer tok" } });
  return r.ok
    ? { ok: true as const, value: (await r.json()) as never }
    : { ok: false as const, error: { code: "server.error" } };
};
const LOOKUP = {
  search: async (api: string, _t: string, text: string) => {
    const r = await get(`${api}/species?q=${encodeURIComponent(text)}`);
    return r.ok ? { ok: true as const, value: (r.value as { species: never[] }).species } : r;
  },
  load: (api: string, _t: string, id: string) => get(`${api}/species/${id}`),
};
const open = vi.fn();
const view = () =>
  render(<StartPage lookup={LOOKUP} api="http://api" token={token} accountId="a1" onOpen={open} />);
const world = (over: Partial<World> = {}): World => ({
  zones: ZONES,
  cards: [],
  writes: [],
  ...over,
});
const paths = () =>
  (fetch as ReturnType<typeof vi.fn>).mock.calls.map(([u]) => new URL(String(u)).pathname);

async function pickSpecies() {
  await userEvent.type(await screen.findByLabelText("Name der Pflanze"), "Monstera");
  await userEvent.click(await screen.findByRole("button", { name: /Monstera deliciosa/ }));
}

beforeEach(() => {
  open.mockClear();
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-ONB-01 start with the first plant", () => {
  it("US-ONB-01 a new account starts with the first plant; no location and no light zone is asked or loaded", async () => {
    fakeServer(world());
    view();
    expect(await screen.findByRole("heading", { name: "Deine erste Pflanze" })).toBeTruthy();
    expect(screen.getByText("Schritt 1 von 2: Art wählen")).toBeTruthy();
    expect(screen.queryByText(/Standort|Lichtzone/)).toBeNull();
    expect(paths()).not.toContain("/locations");
    expect(paths()).not.toContain("/light-zones");
  });

  it("US-ONB-01 picking a species prefills the light need from the species as a value to change", async () => {
    fakeServer(world());
    view();
    await pickSpecies();
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
    expect(screen.getByText("Schritt 2 von 2: Pflanze speichern")).toBeTruthy();
    const select = (await screen.findByLabelText("Lichtbedarf")) as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(select.selectedOptions[0]?.textContent).toBe("Lampe 2 (laut Art)");
  });

  it("US-ONB-01 saving creates the specimen of the species, derived light is not stored, and the next action is named", async () => {
    const w = world();
    fakeServer(w);
    view();
    await pickSpecies();
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
    await userEvent.click(await screen.findByRole("button", { name: "Pflanze speichern" }));
    expect(await screen.findByRole("heading", { name: /ist angelegt/ })).toBeTruthy();
    const created = w.writes.find((x) => x.path === "/specimens");
    expect(created?.body["speciesId"]).toBe("sp1");
    expect(created?.body).not.toHaveProperty("lightZoneId");
    expect(created?.body).not.toHaveProperty("locationId");
    await userEvent.click(screen.getByRole("button", { name: "Miss deine Pflanze" }));
    expect(open).toHaveBeenCalledWith("collection");
  });

  it("US-ONB-01 a light need the keeper changed is sent as the specimen's own zone", async () => {
    const w = world();
    fakeServer(w);
    view();
    await pickSpecies();
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
    await userEvent.selectOptions(await screen.findByLabelText("Lichtbedarf"), "z4");
    await userEvent.click(screen.getByRole("button", { name: "Pflanze speichern" }));
    await screen.findByRole("heading", { name: /ist angelegt/ });
    expect(w.writes.find((x) => x.path === "/specimens")?.body["lightZoneId"]).toBe("z4");
  });

  it("US-ONB-01 · US-ONB-02 a new account without light zones gets the standard ones silently, nothing is shown as missing", async () => {
    const w = world({ zones: [] });
    fakeServer(w);
    view();
    await pickSpecies();
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
    const select = (await screen.findByLabelText("Lichtbedarf")) as HTMLSelectElement;
    await vi.waitFor(() =>
      expect(select.selectedOptions[0]?.textContent).toBe("Lampe 2 (laut Art)"),
    );
    expect(w.writes.map((x) => x.path)).toContain("/light-zones/defaults");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("US-ONB-01 going back keeps what was entered", async () => {
    fakeServer(world());
    view();
    await pickSpecies();
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
    await userEvent.click(await screen.findByRole("button", { name: "Zurück" }));
    expect(((await screen.findByLabelText("Name der Pflanze")) as HTMLInputElement).value).toBe(
      "Monstera",
    );
    expect(
      (await screen.findByRole("button", { name: /Monstera deliciosa/ })).getAttribute(
        "aria-pressed",
      ),
    ).toBe("true");
  });

  it("US-ONB-01 a name without a hit offers the catalog instead of a dead end", async () => {
    fakeServer(world({ hits: [] }));
    view();
    await userEvent.type(await screen.findByLabelText("Name der Pflanze"), "Zzz");
    await userEvent.click(
      await screen.findByRole("button", { name: "Im Katalog suchen oder vorschlagen" }),
    );
    expect(open).toHaveBeenCalledWith("species");
  });

  it("US-ONB-01 every step is announced as Schritt n von m, focus moves to the new heading, one h1", async () => {
    fakeServer(world());
    view();
    await pickSpecies();
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
    const heading = await screen.findByRole("heading", { name: "Pflanze speichern" });
    expect(document.activeElement).toBe(heading);
    const marker = screen.getByText("Schritt 2 von 2: Pflanze speichern");
    expect(marker.getAttribute("role")).toBe("status");
    expect(marker.className).toMatch(/rounded-full.*border/);
    expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual([
      "Start",
    ]);
  });

  it("US-ONB-01 skipping shows the normal first-plant action and no card about locations or light zones", async () => {
    fakeServer(world({ zones: [] }));
    view();
    await userEvent.click(await screen.findByRole("button", { name: "Überspringen" }));
    expect(await screen.findByRole("heading", { name: "Deine erste Pflanze" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/Standort|Lichtzone/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Art im Katalog wählen" }));
    expect(open).toHaveBeenCalledWith("species");
    cleanup();
    view();
    expect(await screen.findByRole("button", { name: "Art im Katalog wählen" })).toBeTruthy();
    expect(screen.queryByLabelText("Name der Pflanze")).toBeNull();
  });

  it("US-ONB-01 a returning keeper (all plants archived) gets the next plant, not the flow (#291)", async () => {
    fakeServer(world({ archived: 2 }));
    view();
    expect(await screen.findByRole("heading", { name: "Nächste Pflanze" })).toBeTruthy();
    expect(screen.queryByText(/Schritt 1 von/)).toBeNull();
    expect(screen.queryByLabelText("Name der Pflanze")).toBeNull();
  });
});

describe("US-ACC-03 start page", () => {
  it("US-ACC-03 with a plant the start page points to the collection, without hints about setup", async () => {
    fakeServer(world({ zones: [], cards: [{ id: "e1" }] }));
    view();
    expect(await screen.findByRole("heading", { name: "Start" })).toBeTruthy();
    expect(screen.queryByLabelText("Hinweise zur Einrichtung")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Zum Bestand" }));
    expect(open).toHaveBeenCalledWith("collection");
  });

  it("US-ACC-03 the start page counts the specimens with the count route, it does not load the card list", async () => {
    fakeServer(world({ cards: [{ id: "e1" }] }));
    view();
    await screen.findByRole("heading", { name: "Start" });
    expect(paths()).toContain("/specimens/count");
    expect(paths()).not.toContain("/specimens/cards");
  });

  it("US-ACC-03 a load error is shown with a retry, never a blank start page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        response(500, { error: { code: "server.error", text: "Der Server antwortet nicht." } }),
      ),
    );
    view();
    expect((await screen.findByRole("alert")).textContent).toContain("Der Server antwortet nicht.");
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
  });
});
