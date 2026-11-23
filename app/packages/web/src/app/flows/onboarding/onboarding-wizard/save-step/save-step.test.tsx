// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { answerCardRead } from "../../../../../collection/specimens/tests/cards-fake";
import { OnboardingWizard } from "../onboarding-wizard";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";
const HIT = { id: "sp1", latinName: "Monstera deliciosa", germanName: "Fensterblatt" };
const SPECIES = { ...HIT, lightDemandLux: 12000, standardLevel: 2, softLeaf: false };
const DEFAULT_ZONES = [
  { id: "z2", name: "Zone 2", luxCeiling: 15000, ppfd: null, sortOrder: 2 },
  { id: "z4", name: "Zone 4", luxCeiling: 60000, ppfd: null, sortOrder: 4 },
];
const DEFAULT_LOCATIONS = [{ id: "l1", name: "Zuhause", lightZoneId: null, kind: "indoor" }];
const REASON = "Keine Verbindung. Deine Eingabe bleibt hier stehen.";

/** The account on the server: a new account has no zones and no places until the defaults are created (US-ONB-02). */
let zones: unknown[] = [];
let locations: unknown[] = [];
const writes: { path: string; body: Record<string, unknown>; key: string | null }[] = [];
/** Reads of the zones, and a refusal of them by the server (not the network) when `zonesRefused` is set. */
let zonesReads = 0;
let zonesRefused = false;
/** While set, the read of the plants of the species (the marker rule) or the create waits for it (US-QS-03). */
let rulePending: Promise<void> | null = null;
let createPending: Promise<void> | null = null;
/** The error codes the server answers the next creates of the plant with, one each; empty = it saves (US-QS-03). */
let createRefusals: string[] = [];

function server() {
  zones = [];
  locations = [];
  zonesReads = 0;
  zonesRefused = false;
  rulePending = null;
  createPending = null;
  createRefusals = [];
  writes.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        writes.push({ path, body, key: new Headers(init.headers).get("Idempotency-Key") });
        if (path === "/light-zones/defaults") zones = [...DEFAULT_ZONES];
        if (path === "/locations/defaults") locations = [...DEFAULT_LOCATIONS];
        if (path === "/specimens") await createPending;
        const refused = path === "/specimens" ? createRefusals.shift() : undefined;
        if (refused) return response(409, { error: { code: refused, text: refused } });
        return response(201, { id: "e1", speciesId: "sp1" });
      }
      if (path === "/light-zones") {
        zonesReads += 1;
        if (zonesRefused) return response(500, { error: { code: "server.error", text: "raw" } });
        return response(200, { zones });
      }
      if (path === "/locations") return response(200, { locations });
      if (path.startsWith("/specimens/cards")) {
        await rulePending;
        return answerCardRead(new URL(String(url)), []) ?? response(404, {});
      }
      if (path === "/species") return response(200, { species: [HIT] });
      if (path === "/species/sp1") return response(200, SPECIES);
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

/** The device's connection (`navigator.onLine`) of a test; it starts offline and a test sets it online (issue 2098). */
function connection(online = false) {
  return vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(online);
}

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

async function toSave() {
  await userEvent.type(await screen.findByLabelText("Art"), "Monstera");
  await userEvent.click(await screen.findByRole("button", { name: /Monstera deliciosa/ }));
  await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
}

const saveButton = () => screen.getByRole("button", { name: "Pflanze sichern" });

/** The save button is usable once the light need and the marker rule of the species are known (issue 1638, US-QS-03). */
async function untilSaveEnabled() {
  await waitFor(() => expect(saveButton().getAttribute("aria-disabled")).toBeNull());
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("US-ONB-01 offline, the default zones fail with the reason and a retry (issue 2098)", () => {
  it("US-ONB-01 offline, the default zones fail with the reason and a retry, never an empty list", async () => {
    connection();
    server();
    view();
    await toSave();
    expect(await screen.findByText(REASON)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
    // Inert while the zones are missing, and not busy: the reason and its retry stand in the block (US-QS-03).
    expect(saveButton().getAttribute("aria-disabled")).toBe("true");
    expect(saveButton().getAttribute("aria-busy")).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Lichtbedarf" })).toBeNull();
    // Nothing is sent while the device is offline (US-QS-30): the defaults are not created yet.
    expect(writes.find((w) => w.path === "/light-zones/defaults")).toBeUndefined();
  });

  it("US-ONB-01 pressing Erneut versuchen online creates the zones and shows the select", async () => {
    const net = connection();
    server();
    view();
    await toSave();
    await screen.findByText(REASON);
    net.mockReturnValue(true);
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    const select = await screen.findByRole("combobox", { name: "Lichtbedarf" });
    expect(within(select).getByRole("option", { name: "Zone 4" })).toBeTruthy();
    expect(screen.queryByText(REASON)).toBeNull();
    expect(writes.filter((w) => w.path === "/light-zones/defaults")).toHaveLength(1);
  });

  it("US-ONB-01 after Erneut versuchen the focus stays on the step heading, not the body (issue 2098)", async () => {
    const net = connection();
    server();
    view();
    await toSave();
    await screen.findByText(REASON);
    net.mockReturnValue(true);
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    await screen.findByRole("combobox", { name: "Lichtbedarf" });
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Schritt 2 von 2: Pflanze sichern" }),
    );
  });

  it("US-ONB-01 the device coming back online loads the zones again, without a press", async () => {
    const net = connection();
    server();
    view();
    await toSave();
    await screen.findByText(REASON);
    net.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(await screen.findByRole("combobox", { name: "Lichtbedarf" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Erneut versuchen" })).toBeNull();
    expect(writes.filter((w) => w.path === "/light-zones/defaults")).toHaveLength(1);
  });

  it("US-ONB-01 the chosen species stays on the save step through the retry, and the save creates the plant", async () => {
    const net = connection();
    server();
    view();
    await toSave();
    await screen.findByText(REASON);
    net.mockReturnValue(true);
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    await screen.findByRole("combobox", { name: "Lichtbedarf" });
    expect(screen.getByRole("heading", { name: "Schritt 2 von 2: Pflanze sichern" })).toBeTruthy();
    expect(screen.getByText("Monstera deliciosa", { selector: "i" })).toBeTruthy();
    await untilSaveEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Pflanze sichern" }));
    expect(await screen.findByRole("heading", { name: /ist angelegt/ })).toBeTruthy();
    expect(writes.find((w) => w.path === "/specimens")?.body).toMatchObject({ speciesId: "sp1" });
  });

  it("US-ONB-01 a refusal while online shows its text and waits for the press, it does not load in a loop (issue 2098)", async () => {
    connection(true);
    server();
    zonesRefused = true;
    view();
    await toSave();
    expect(await screen.findByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
    const reads = zonesReads;
    await act(async () => {
      await new Promise((done) => setTimeout(done, 50));
    });
    expect(zonesReads).toBe(reads);
    expect(screen.queryByRole("combobox", { name: "Lichtbedarf" })).toBeNull();
  });
});

/** A promise the test settles by hand: the read or the write it holds in the fake server answers when `release` runs. */
function held() {
  let release = () => {};
  const until = new Promise<void>((done) => {
    release = done;
  });
  return { until, release };
}

describe("US-QS-03 · a save that waits for the marker rule is shown busy, never a silent no-op (P-10)", () => {
  it("US-QS-03 while the rule of the species is read the save is aria-disabled and busy, a press sends nothing, and it works once the rule is there", async () => {
    connection(true);
    server();
    const rule = held();
    rulePending = rule.until;
    view();
    await toSave();
    await screen.findByRole("combobox", { name: "Lichtbedarf" });
    // The zones are there, the rule is not: the button is inert but visibly busy, and still focusable (PF-045).
    const button = saveButton();
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(button.querySelector(".animate-spin")).not.toBeNull();
    await userEvent.click(button);
    expect(writes.find((w) => w.path === "/specimens")).toBeUndefined();
    expect(screen.getByRole("heading", { name: "Schritt 2 von 2: Pflanze sichern" })).toBeTruthy();
    expect(saveButton().getAttribute("aria-busy")).toBe("true");
    rule.release();
    await untilSaveEnabled();
    expect(saveButton().getAttribute("aria-busy")).toBeNull();
    expect(saveButton().querySelector(".animate-spin")).toBeNull();
    await userEvent.click(saveButton());
    expect(await screen.findByRole("heading", { name: /ist angelegt/ })).toBeTruthy();
    expect(writes.filter((w) => w.path === "/specimens")).toHaveLength(1);
  });

  it("US-QS-03 while the save runs the button is busy and keeps the focus, and a second press sends no second plant", async () => {
    connection(true);
    server();
    const create = held();
    createPending = create.until;
    view();
    await toSave();
    await untilSaveEnabled();
    const button = saveButton();
    await userEvent.click(button);
    await userEvent.click(button);
    await waitFor(() => expect(saveButton().getAttribute("aria-busy")).toBe("true"));
    await act(async () => {
      await new Promise((done) => setTimeout(done, 30));
    });
    expect(document.activeElement).toBe(saveButton());
    expect(writes.filter((w) => w.path === "/specimens")).toHaveLength(1);
    create.release();
    expect(await screen.findByRole("heading", { name: /ist angelegt/ })).toBeTruthy();
    expect(writes.filter((w) => w.path === "/specimens")).toHaveLength(1);
  });
});

describe("US-QS-03 · P-10 a key conflict of the first plant can be dismissed", () => {
  it("US-QS-03 a key conflict of the save offers Hinweis schließen: it clears the note, returns the focus to the save button and frees the key", async () => {
    connection(true);
    server();
    createRefusals = ["idempotency.key_conflict"];
    view();
    await toSave();
    await untilSaveEnabled();
    await userEvent.click(saveButton());
    const note = await screen.findByRole("alert");
    // The conflict keeps its key: without the dismiss the next press would send it again.
    await userEvent.click(within(note).getByRole("button", { name: "Hinweis schließen" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.activeElement).toBe(saveButton());
    await userEvent.click(saveButton());
    expect(await screen.findByRole("heading", { name: /ist angelegt/ })).toBeTruthy();
    const keys = writes.filter((w) => w.path === "/specimens").map((w) => w.key);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBeTruthy();
    expect(keys[1]).not.toBe(keys[0]);
  });

  it("US-QS-03 a refusal that is no key conflict shows its text without Hinweis schließen", async () => {
    connection(true);
    server();
    createRefusals = ["server.error"];
    view();
    await toSave();
    await untilSaveEnabled();
    await userEvent.click(saveButton());
    const note = await screen.findByRole("alert");
    expect(note.textContent?.length).toBeGreaterThan(0);
    expect(within(note).queryByRole("button", { name: "Hinweis schließen" })).toBeNull();
  });
});
