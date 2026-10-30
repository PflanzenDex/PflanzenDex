// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HINT_MAX_WORDS } from "@pflanzendex/core";
import { HINT_TEXTS } from "./hint/hint-texts";
import { TodayIntro } from "./today-intro";

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
  /** The keeper style answer of the account (US-ONB-03); `chosen: false` until the question is answered. */
  style?: { style: string; chosen: boolean };
  /** The hint state of the account (US-ONB-07, DM-ONB-03): the due hint and the stored end of the guide. */
  hint?: string | null;
  guideEnded?: boolean;
  hits?: unknown[];
  locations?: { id: string; name: string; lightZoneId: string | null; kind: string }[];
  writes: { method: string; path: string; body: Record<string, unknown> }[];
}

/** The keeper style question of US-ONB-03: the stored answer and its change. */
function styleAnswer(w: World, path: string, method: string): Promise<Response> | null {
  const hint = hintAnswer(w, path, method);
  if (hint) return hint;
  if (path !== "/onboarding/style") return null;
  if (method === "GET") return response(200, w.style ?? { style: "few", chosen: true });
  return response(200, { style: w.writes.at(-1)?.body["style"] });
}

/** The hints of US-ONB-07: the account's state, and its changes (the guide ends per account). */
function hintAnswer(w: World, path: string, method: string): Promise<Response> | null {
  if (path === "/onboarding/hints")
    return response(200, { hint: w.hint ?? null, guideEnded: !!w.guideEnded });
  if (!path.startsWith("/onboarding/hints/") || method === "GET") return null;
  const last = w.writes.at(-1);
  if (path.endsWith("/first_plant_guide") && last?.body["state"] === "dismissed")
    w.guideEnded = true;
  return response(200, { occasion: path.split("/").at(-1) });
}

/** The writes of US-ONB-02: the default location and placing the plant. */
function placeWrite(w: World, path: string, method = "POST"): Promise<Response> | null {
  if (method === "GET" && path === "/locations")
    return response(200, { locations: w.locations ?? [] });
  const style = styleAnswer(w, path, method);
  if (style) return style;
  if (method === "GET") return null;
  if (path === "/locations/defaults") {
    w.locations = [{ id: "l1", name: "Zuhause", lightZoneId: null, kind: "indoor" }];
    return response(201, w.locations[0]);
  }
  if (path === "/specimens/e1/location") return response(200, { id: "e1" });
  if (path === "/locations/l1") return response(200, { id: "l1" });
  if (path === "/light-zones/defaults") {
    w.zones = ZONES;
    return response(201, { zones: ZONES });
  }
  if (path === "/specimens") return response(201, { id: "e1", speciesId: "sp1" });
  return null;
}

function fakeServer(w: World) {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const u = new URL(String(url));
      const method = init?.method ?? "GET";
      const read = method === "GET" ? placeWrite(w, u.pathname, method) : null;
      if (read) return read;
      if (method !== "GET") {
        const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
        w.writes.push({ method, path: u.pathname, body });
        const made = placeWrite(w, u.pathname);
        if (made) return made;
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
  render(
    <TodayIntro
      lookup={LOOKUP}
      api="http://api"
      token={token}
      onOpen={open}
      fallback={<p role="status">Heute wird geladen …</p>}
    >
      <p>Aufgaben des Tages</p>
    </TodayIntro>,
  );
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
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-ONB-01 start with the first plant on Heute", () => {
  it("US-QS-18 · US-ONB-01 the introduction still shows on Heute: a new account starts with the first plant; no location and no light zone is asked or loaded", async () => {
    fakeServer(world());
    view();
    expect(await screen.findByRole("heading", { name: "Deine erste Pflanze" })).toBeTruthy();
    expect(screen.getByText("Schritt 1 von 2: Art wählen")).toBeTruthy();
    expect(screen.queryByText(/Standort|Lichtzone/)).toBeNull();
    expect(paths()).not.toContain("/locations");
    expect(paths()).not.toContain("/light-zones");
  });

  it("US-ONB-01 · NFR-13 the hits are announced politely and the disabled Weiter says why", async () => {
    fakeServer(world());
    view();
    await screen.findByRole("heading", { name: "Deine erste Pflanze" });
    expect(screen.getByRole("button", { name: "Weiter" }).getAttribute("aria-describedby")).toBe(
      "first-plant-next-hint",
    );
    expect(screen.getByText("Wähle zuerst eine Art aus den Treffern.")).toBeTruthy();
    await pickSpecies();
    expect(await screen.findByText(/\d+ Treffer, wähle eine Art/)).toBeTruthy();
    expect(screen.queryByText("Wähle zuerst eine Art aus den Treffern.")).toBeNull();
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
      "Heute",
    ]);
  });

  it("US-QS-16 · US-ONB-01 skipping shows the day's tasks in place of the guide and no card about locations or light zones", async () => {
    fakeServer(world({ zones: [] }));
    view();
    expect(screen.queryByText("Aufgaben des Tages")).toBeNull();
    await userEvent.click(await screen.findByRole("button", { name: "Überspringen" }));
    expect(await screen.findByText("Aufgaben des Tages")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/Standort|Lichtzone/)).toBeNull();
    cleanup();
    view();
    expect(await screen.findByText("Aufgaben des Tages")).toBeTruthy();
    expect(screen.queryByLabelText("Name der Pflanze")).toBeNull();
  });

  it("US-ONB-07 · DM-ONB-03 ending the guide is stored for the account, not for the device", async () => {
    const w = world();
    fakeServer(w);
    view();
    await userEvent.click(await screen.findByRole("button", { name: "Überspringen" }));
    await vi.waitFor(() =>
      expect(w.writes).toContainEqual({
        method: "PUT",
        path: "/onboarding/hints/first_plant_guide",
        body: { state: "dismissed", timeZone: expect.any(String) },
      }),
    );
    expect(window.localStorage.length).toBe(0);
    cleanup();
    // another device of the same account: the guide stays ended
    view();
    expect(await screen.findByText("Aufgaben des Tages")).toBeTruthy();
    expect(screen.queryByLabelText("Name der Pflanze")).toBeNull();
  });

  it("US-ONB-07 a guide that ended on another device does not come back here", async () => {
    fakeServer(world({ guideEnded: true }));
    view();
    expect(await screen.findByText("Aufgaben des Tages")).toBeTruthy();
    expect(screen.queryByLabelText("Name der Pflanze")).toBeNull();
  });

  it("US-ONB-01 a returning keeper (all plants archived) gets the day's tasks, not the flow (#291)", async () => {
    fakeServer(world({ archived: 2 }));
    view();
    expect(await screen.findByText("Aufgaben des Tages")).toBeTruthy();
    expect(screen.queryByText(/Schritt 1 von/)).toBeNull();
    expect(screen.queryByLabelText("Name der Pflanze")).toBeNull();
  });
});

async function saveFirstPlant() {
  await pickSpecies();
  await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
  await userEvent.click(await screen.findByRole("button", { name: "Pflanze speichern" }));
  await screen.findByRole("heading", { name: /ist angelegt/ });
}

describe("US-ONB-02 places and light come later, with defaults", () => {
  it("US-ONB-02 a new account gets the location Zuhause from the start, nothing is asked before the plant", async () => {
    const w = world({ zones: [] });
    fakeServer(w);
    view();
    await pickSpecies();
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
    await screen.findByLabelText("Lichtbedarf");
    await vi.waitFor(() => expect(w.writes.map((x) => x.path)).toContain("/locations/defaults"));

    expect(screen.queryByText("Wo steht sie?")).toBeNull();
  });

  it("US-ONB-02 an account that already has a location gets no second one", async () => {
    const w = world({
      locations: [{ id: "l9", name: "Balkon", lightZoneId: "z4", kind: "outdoor" }],
    });
    fakeServer(w);
    view();
    await saveFirstPlant();
    expect(w.writes.map((x) => x.path)).not.toContain("/locations/defaults");
  });

  it("US-ONB-02 after saving, one question 'Wo steht sie?' sets the location of the plant", async () => {
    const w = world();
    fakeServer(w);
    view();
    await saveFirstPlant();
    expect(await screen.findByText(/Wo steht sie\?/)).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText("Licht bei Zuhause"), "z3");
    await userEvent.click(screen.getByRole("button", { name: "Hier steht sie" }));
    await vi.waitFor(() =>
      expect(w.writes.find((x) => x.path === "/specimens/e1/location")?.body).toEqual({
        locationId: "l1",
      }),
    );
    expect(w.writes.find((x) => x.path === "/locations/l1")?.body).toMatchObject({
      lightZoneId: "z3",
    });
    expect(screen.queryByText(/Wo steht sie\?/)).toBeNull();
    expect(screen.getByRole("button", { name: "Miss deine Pflanze" })).toBeTruthy();
    expect((await screen.findByRole("status")).textContent).toBe(
      "Standort gespeichert: Zuhause, Lampe 3.",
    );
  });

  it("US-ONB-02 · P-10 a location shows the light it brings before it is chosen and the save says it", async () => {
    const w = world({
      locations: [{ id: "l9", name: "Balkon", lightZoneId: "z4", kind: "outdoor" }],
    });
    fakeServer(w);
    view();
    await saveFirstPlant();
    expect(await screen.findByText("Balkon (Lampe 4)")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Hier steht sie" }));
    expect((await screen.findByRole("status")).textContent).toBe(
      "Standort gespeichert: Balkon, Lampe 4.",
    );
  });

  it("US-ONB-02 'Später' leaves the plant without a place, no error, the next action stays", async () => {
    const w = world();
    fakeServer(w);
    view();
    await saveFirstPlant();
    await userEvent.click(await screen.findByRole("button", { name: "Später" }));
    expect(w.writes.map((x) => x.path)).not.toContain("/specimens/e1/location");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/Wo steht sie\?/)).toBeNull();
    expect(screen.getByRole("button", { name: "Miss deine Pflanze" })).toBeTruthy();
  });

  it("US-ONB-02 Heute shows no permanent card about missing locations or light zones", async () => {
    fakeServer(world({ zones: [], cards: [{ id: "e1" }] }));
    view();
    await screen.findByText("Aufgaben des Tages");
    expect(screen.queryByText(/noch keinen Standort|keine Lichtzonen/)).toBeNull();
  });
});

describe("US-ONB-03 the style question after the first plant", () => {
  const ask = () => world({ style: { style: "few", chosen: false } });

  it("US-ONB-03 it is not asked before the plant is saved", async () => {
    fakeServer(ask());
    view();
    await pickSpecies();
    expect(screen.queryByText("Wie nutzt du die App?")).toBeNull();
    expect(paths()).not.toContain("/onboarding/style");
  });

  it("US-ONB-03 after saving and answering the place, one question with two answers, no level or rank", async () => {
    fakeServer(ask());
    view();
    await saveFirstPlant();
    await userEvent.click(await screen.findByRole("button", { name: "Später" }));
    expect(
      await screen.findByRole("button", { name: "Ich pflege ein paar Pflanzen" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ich verwalte viel, zeig mir alles" })).toBeTruthy();
    expect(screen.queryByText(/Level|Rang|Stufe/i)).toBeNull();
  });

  it("US-ONB-03 an answer is stored once; 'Später' on the question stores few", async () => {
    const w = ask();
    fakeServer(w);
    view();
    await saveFirstPlant();
    await userEvent.click(await screen.findByRole("button", { name: "Später" }));
    await userEvent.click(await screen.findByRole("button", { name: /zeig mir alles/ }));
    await vi.waitFor(() =>
      expect(w.writes.find((x) => x.path === "/onboarding/style")?.body).toMatchObject({
        style: "many",
      }),
    );
    expect(screen.queryByText("Wie nutzt du die App?")).toBeNull();
    expect(screen.getByRole("button", { name: "Miss deine Pflanze" })).toBeTruthy();
    expect(await screen.findByText("Alles ist jetzt offen.")).toBeTruthy();
  });

  it("US-ONB-03 an account that already answered (or an existing one with many) is not asked", async () => {
    fakeServer(world({ style: { style: "many", chosen: true } }));
    view();
    await saveFirstPlant();
    await userEvent.click(await screen.findByRole("button", { name: "Später" }));
    await vi.waitFor(() => expect(paths()).toContain("/onboarding/style"));
    expect(screen.queryByText("Wie nutzt du die App?")).toBeNull();
  });
});

describe("US-ONB-07 calm hints on Heute", () => {
  it("US-QS-18 · US-ONB-07 the introduction still shows on Heute: a due hint is a short note without modal; it is recorded as shown and 'Okay' dismisses it for good", async () => {
    const w = world({ cards: [{ id: "e1" }], hint: "first_plant_saved" });
    fakeServer(w);
    view();
    const note = await screen.findByRole("status", { name: "Hinweis" });
    expect(note.textContent).toContain("Deine erste Pflanze ist da.");
    expect(screen.queryByRole("dialog")).toBeNull();
    await vi.waitFor(() =>
      expect(w.writes.map((x) => `${x.path}:${String(x.body["state"])}`)).toContain(
        "/onboarding/hints/first_plant_saved:shown",
      ),
    );
    // looking for something is never held back: the tasks stay, the note comes above them
    const tasks = screen.getByText("Aufgaben des Tages");
    expect(note.compareDocumentPosition(tasks) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Okay" }));
    await vi.waitFor(() => expect(screen.queryByRole("status", { name: "Hinweis" })).toBeNull());
    expect(w.writes.map((x) => `${x.path}:${String(x.body["state"])}`)).toContain(
      "/onboarding/hints/first_plant_saved:dismissed",
    );
  });

  it("US-ONB-07 no hint is due (dismissed, expired, calm mode or style many): no note", async () => {
    fakeServer(world({ cards: [{ id: "e1" }], hint: null }));
    view();
    await screen.findByText("Aufgaben des Tages");
    expect(screen.queryByRole("status", { name: "Hinweis" })).toBeNull();
  });

  it("US-ONB-07 a hint that cannot be saved stays and says so, nothing disappears silently (P-10)", async () => {
    const w = world({ cards: [{ id: "e1" }], hint: "first_plant_saved" });
    fakeServer(w);
    view();
    await screen.findByRole("status", { name: "Hinweis" });
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => response(500, { error: { code: "server.error" } })),
    );
    await userEvent.click(screen.getByRole("button", { name: "Okay" }));
    expect((await screen.findByRole("alert")).textContent).toContain("nicht speichern");
    expect(screen.getByRole("status", { name: "Hinweis" })).toBeTruthy();
  });

  it("US-ONB-07 the hint texts have at most 12 words and name no level, rank or pressure", () => {
    for (const text of Object.values(HINT_TEXTS)) {
      expect(text.split(/\s+/).length).toBeLessThanOrEqual(HINT_MAX_WORDS);
      expect(text).not.toMatch(/Level|Rang|Stufe|nur noch|schnell/i);
    }
  });
});

describe("US-QS-16 · US-ACC-03 the onboarding parts of Heute", () => {
  it("US-QS-16 · US-ACC-03 with a plant Heute shows the tasks, without hints about setup", async () => {
    fakeServer(world({ zones: [], cards: [{ id: "e1" }] }));
    view();
    expect(await screen.findByText("Aufgaben des Tages")).toBeTruthy();
    expect(screen.queryByLabelText("Hinweise zur Einrichtung")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Start" })).toBeNull();
  });

  it("US-ACC-03 Heute counts the specimens with the count route, it does not load the card list", async () => {
    fakeServer(world({ cards: [{ id: "e1" }] }));
    view();
    await screen.findByText("Aufgaben des Tages");
    expect(paths()).toContain("/specimens/count");
    expect(paths()).not.toContain("/specimens/cards");
  });

  it("US-QS-16 when the count is not there the tasks still show, Heute is never blank", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        response(500, { error: { code: "server.error", text: "Der Server antwortet nicht." } }),
      ),
    );
    view();
    expect(await screen.findByText("Aufgaben des Tages")).toBeTruthy();
  });
});
