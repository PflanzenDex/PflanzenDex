// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GENERIC_ERROR_TEXT } from "@/shared/lib/error-text";
import { answerCardRead } from "../../../../../collection/specimens/tests/cards-fake";
import { OnboardingWizard } from "../onboarding-wizard";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const token = async () => "tok";
const HIT = { id: "sp1", latinName: "Monstera deliciosa", germanName: "Fensterblatt" };
const SPECIES = { ...HIT, lightDemandLux: 12000, standardLevel: 2, softLeaf: false };
const DEFAULT_ZONES = [
  { id: "z2", name: "Zone 2", luxCeiling: 15000, ppfd: null, sortOrder: 2 },
  { id: "z4", name: "Zone 4", luxCeiling: 60000, ppfd: null, sortOrder: 4 },
];
const DEFAULT_LOCATIONS = [{ id: "l1", name: "Zuhause", lightZoneId: null, kind: "indoor" }];
const REASON = "Keine Verbindung. Deine Eingabe bleibt hier stehen.";
const SERVER_DOWN = { error: { code: "server.error", text: "raw" } };

/** The account on the server and the device of one test (US-ONB-02, issue 2127). */
interface World {
  /** `navigator.onLine` of the device; a test sets it and fires `online` itself. */
  online: boolean;
  /** The device goes offline once the plant is saved, so the question's default location is tried without a connection. */
  dropAfterSave: boolean;
  zones: unknown[];
  locations: unknown[];
  /** The next creations of the default location that the server refuses with a server error. */
  failDefaults: number;
  /** Every creation is refused because a location exists already (created on another device meanwhile). */
  locationExistsMeanwhile: boolean;
  /** The next reads of the locations that the server refuses. */
  failLocationReads: number;
  /** Every read of the light zones is refused. */
  zonesRefused: boolean;
  locationReads: number;
  writes: { path: string; body: Record<string, unknown> }[];
}

function world(over: Partial<World> = {}): World {
  const w: World = {
    online: true,
    dropAfterSave: false,
    zones: [],
    locations: [],
    failDefaults: 0,
    locationExistsMeanwhile: false,
    failLocationReads: 0,
    zonesRefused: false,
    locationReads: 0,
    writes: [],
    ...over,
  };
  vi.spyOn(window.navigator, "onLine", "get").mockImplementation(() => w.online);
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const u = new URL(String(url));
      if (init?.method && init.method !== "GET") {
        w.writes.push({
          path: u.pathname,
          body: JSON.parse(String(init.body)) as Record<string, unknown>,
        });
        return write(w, u.pathname);
      }
      return read(w, u);
    }),
  );
  return w;
}

function write(w: World, path: string): Response {
  if (path === "/light-zones/defaults") {
    w.zones = DEFAULT_ZONES;
    return json(201, { zones: DEFAULT_ZONES });
  }
  if (path === "/locations/defaults") {
    if (w.locationExistsMeanwhile) {
      w.locations = DEFAULT_LOCATIONS;
      return json(409, { error: { code: "location.not_empty", text: "raw" } });
    }
    if (w.failDefaults > 0) {
      w.failDefaults -= 1;
      return json(500, SERVER_DOWN);
    }
    w.locations = DEFAULT_LOCATIONS;
    return json(201, DEFAULT_LOCATIONS[0]);
  }
  if (path === "/specimens") {
    if (w.dropAfterSave) w.online = false;
    return json(201, { id: "e1", speciesId: "sp1" });
  }
  return json(404, {});
}

async function read(w: World, u: URL): Promise<Response> {
  const path = u.pathname;
  if (path === "/locations") {
    w.locationReads += 1;
    if (w.failLocationReads > 0) {
      w.failLocationReads -= 1;
      return json(500, SERVER_DOWN);
    }
    return json(200, { locations: w.locations });
  }
  if (path === "/light-zones") {
    if (w.zonesRefused) return json(500, SERVER_DOWN);
    return json(200, { zones: w.zones });
  }
  if (path.startsWith("/specimens/cards")) return (await answerCardRead(u, [])) ?? json(404, {});
  if (path === "/species") return json(200, { species: [HIT] });
  if (path === "/species/sp1") return json(200, SPECIES);
  if (path === "/onboarding/style") return json(200, { style: "few", chosen: true });
  return json(404, {});
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

const view = () =>
  render(
    <MemoryRouter>
      <OnboardingWizard
        lookup={LOOKUP}
        api="http://api"
        token={token}
        onChoosePlant={() => {}}
        onSkip={() => {}}
        onCreated={() => {}}
      />
    </MemoryRouter>,
  );

/** From the species to the save step; the save is enabled once the zones are loaded (the zone step, issue 2098). */
async function toSaveStep() {
  await userEvent.type(await screen.findByLabelText("Art"), "Monstera");
  await userEvent.click(await screen.findByRole("button", { name: /Monstera deliciosa/ }));
  await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "Pflanze speichern" }) as HTMLButtonElement).disabled,
    ).toBe(false),
  );
}

/** Saves the plant; the question "Wo steht sie?" follows it. */
async function savePlant() {
  await userEvent.click(screen.getByRole("button", { name: "Pflanze speichern" }));
  return screen.findByRole("heading", { name: /ist angelegt/ });
}

const creations = (w: World) => w.writes.filter((x) => x.path === "/locations/defaults");

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("US-ONB-02 the question 'Wo steht sie?' says why it has no place and retries (issue 2127)", () => {
  it("US-ONB-02 offline, the default location fails with the reason and a retry, and nothing is sent while offline", async () => {
    // The zone step's own attempt is refused once and ignored, as before; the question's attempt is the offline one.
    const w = world({ dropAfterSave: true, failDefaults: 1 });
    view();
    await toSaveStep();
    await savePlant();
    expect(await screen.findByText(REASON)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
    expect(creations(w)).toHaveLength(1);
    expect(screen.queryByText("Wo steht sie?")).toBeNull();
    w.online = true;
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(await screen.findByText("Wo steht sie?")).toBeTruthy();
    expect(screen.getByText("Zuhause", { selector: "strong" })).toBeTruthy();
    expect(creations(w)).toHaveLength(2);
  });

  it("US-ONB-02 a server refusal of the default location shows its reason, and the retry creates Zuhause", async () => {
    // The zone step's attempt and the question's first attempt are refused; the retry gets through.
    const w = world({ failDefaults: 2 });
    view();
    await toSaveStep();
    await savePlant();
    expect(await screen.findByText(GENERIC_ERROR_TEXT)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
    expect(screen.queryByText("Wo steht sie?")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(await screen.findByText("Wo steht sie?")).toBeTruthy();
    expect(screen.getByText("Zuhause", { selector: "strong" })).toBeTruthy();
    expect(creations(w)).toHaveLength(3);
  });

  it("US-ONB-02 a failed read of the locations shows the reason, not an empty step", async () => {
    const w = world();
    view();
    await toSaveStep();
    w.failLocationReads = 1;
    await savePlant();
    expect(await screen.findByText(GENERIC_ERROR_TEXT)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
    expect(screen.queryByText("Wo steht sie?")).toBeNull();
  });

  it("US-ONB-02 a failed read of the light zones after the zone step shows the reason, not an empty step", async () => {
    const w = world();
    view();
    await toSaveStep();
    // The zones were read by the zone step; the question reads them again once that copy is older than its window.
    w.zonesRefused = true;
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 6 * 60_000);
    await savePlant();
    expect(await screen.findByText(GENERIC_ERROR_TEXT)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
    expect(screen.queryByText("Wo steht sie?")).toBeNull();
  });

  it("US-ONB-02 the device coming back online asks again without a press", async () => {
    const w = world({ dropAfterSave: true, failDefaults: 1 });
    view();
    await toSaveStep();
    await savePlant();
    expect(await screen.findByText(REASON)).toBeTruthy();
    expect(creations(w)).toHaveLength(1);
    act(() => {
      w.online = true;
      window.dispatchEvent(new Event("online"));
    });
    expect(await screen.findByText("Wo steht sie?")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Erneut versuchen" })).toBeNull();
    expect(creations(w)).toHaveLength(2);
  });

  it("US-ONB-02 a refusal while online shows its reason and waits for the press, it does not loop", async () => {
    const w = world({ failDefaults: Number.POSITIVE_INFINITY });
    view();
    await toSaveStep();
    await savePlant();
    expect(await screen.findByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
    const writes = w.writes.length;
    const reads = w.locationReads;
    await act(async () => {
      await new Promise((done) => setTimeout(done, 50));
    });
    expect(w.writes.length).toBe(writes);
    expect(w.locationReads).toBe(reads);
    expect(screen.queryByText("Wo steht sie?")).toBeNull();
  });

  it("US-ONB-02 'Später' leaves the question while the error shows, and the plant stays without a place", async () => {
    const w = world({ dropAfterSave: true, failDefaults: 1 });
    view();
    await toSaveStep();
    await savePlant();
    expect(await screen.findByText(REASON)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Später" }));
    expect(screen.queryByRole("button", { name: "Erneut versuchen" })).toBeNull();
    expect(screen.queryByText(REASON)).toBeNull();
    expect(screen.getByRole("button", { name: "Pflanze messen" })).toBeTruthy();
    expect(w.writes.map((x) => x.path)).not.toContain("/specimens/e1/location");
  });

  it("US-QS-32 the question names its save as Standort übernehmen, next to Später", async () => {
    world();
    view();
    await toSaveStep();
    await savePlant();
    expect(await screen.findByText("Wo steht sie?")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Standort übernehmen" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Hier steht sie" })).toBeNull();
    expect(screen.getByRole("button", { name: "Später" })).toBeTruthy();
  });

  it("US-ONB-02 after the retry the focus is on the created heading, not on the body", async () => {
    const w = world({ dropAfterSave: true, failDefaults: 1 });
    view();
    await toSaveStep();
    await savePlant();
    expect(await screen.findByText(REASON)).toBeTruthy();
    w.online = true;
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(await screen.findByText("Wo steht sie?")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: /ist angelegt/ }));
  });

  it("US-ONB-02 a location that exists after a refused creation (created meanwhile) is the place, no error", async () => {
    const w = world({ failDefaults: 1 });
    view();
    await toSaveStep();
    w.locationExistsMeanwhile = true;
    await savePlant();
    expect(await screen.findByText("Wo steht sie?")).toBeTruthy();
    expect(screen.getByText("Zuhause", { selector: "strong" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Erneut versuchen" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(creations(w)).toHaveLength(2);
  });
});
