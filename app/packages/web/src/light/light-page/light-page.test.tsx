// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { useLayoutEffect } from "react";
import {
  act,
  cleanup,
  render as plainRender,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation, useNavigate, type NavigateFunction } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { ToastProvider } from "@/shared/patterns/states/toast/toast-provider/toast-provider";
import { AnnouncerProvider } from "@/shared/platform/announcer/announcer";
import { LayerHost } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { LAYER_GUARD, stateFlag } from "@/shared/patterns/responsive/layer-sheet/use-layer";
import { filledIn, hasOwnBorder, isTinted } from "@/shared/ui/button.roles";
import { LightPage } from "./light-page";
import { delayLoads } from "@/shared/ui/skeleton.loading-contract";

/** The navigator and the address of the page, so a test can press Back (US-QS-32); the guard flag is the committed one. */
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
  useLayoutEffect(() => {
    route.guarded = stateFlag(location.state, LAYER_GUARD);
  }, [location]);
  return null;
}
const back = () => act(() => route.navigate?.(-1));

/** The page lives inside the app shell, which owns the toast provider (US-QS-14), and inside the frame of its destination (US-QS-15). */
const render = (ui: React.ReactElement) =>
  plainRender(
    <MemoryRouter>
      <Address />
      <ToastProvider>
        <AnnouncerProvider>
          <LayerHost>{ui}</LayerHost>
        </AnnouncerProvider>
      </ToastProvider>
    </MemoryRouter>,
  );

/** What the shared live region says (DS-69). */
const said = () => document.querySelector(".sr-only[aria-live=polite]")?.textContent?.trim() ?? "";

const SIGNED_OUT = "Du bist nicht angemeldet. Bitte melde dich an.";
const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const zone = { id: "z1", name: "Zone 2", luxCeiling: 15000, ppfd: 300, sortOrder: 2 };
const location = { id: "s1", name: "Balkon", lightZoneId: null, kind: "outdoor" as const };

type Data = { zones: unknown[]; locations: unknown[] };
type Route = (data: Data, body: unknown) => Promise<Response>;

/** Routes of the fake server per "METHOD path"; write calls land in `data` and thereby in the answer on reloading. */
const ROUTES: Record<string, Route> = {
  "POST /light-zones": async (d, body) => {
    d.zones.push({ id: "z9", sortOrder: 9, ppfd: null, ...(body as object) });
    return response(201, {});
  },
  "POST /light-zones/defaults": () =>
    response(409, {
      error: { code: "light_zone.not_empty", text: "raw server text" },
    }),
  "PUT /light-zones/z1": async (d, body) => {
    d.zones[0] = { ...zone, ...(body as object) };
    return response(200, {});
  },
  "DELETE /light-zones/z1": () =>
    response(409, {
      error: {
        code: "light_zone.in_use",
        text: "raw server text",
        data: [{ id: "s1", name: "Balkon" }],
      },
    }),
  "POST /locations": async (d, body) => {
    d.locations.push({ id: "s9", ...(body as object) });
    return response(201, {});
  },
  "PUT /locations/s1": async (d, body) => {
    d.locations[0] = { ...location, ...(body as object) };
    return response(200, {});
  },
  "GET /light-zones": (d) => response(200, { zones: d.zones }),
  "GET /locations": (d) => response(200, { locations: d.locations }),
  // The hints are the locations without light zone, as the API derives them (US-BES-08).
  "GET /hints": (d) =>
    response(200, {
      hints: d.locations
        .filter((l) => (l as { lightZoneId: string | null }).lightZoneId === null)
        .map((l) => ({
          kind: "location_without_zone",
          locationId: (l as { id: string }).id,
          text: `Der Standort „${(l as { name: string }).name}“ hat noch keine Lichtzone.`,
          nextAction: "Weise dem Standort eine Lichtzone zu.",
        })),
    }),
  "GET /specimens/light-overview": () => response(200, { rows: [] }),
  "GET /light-zones/derivation": () =>
    response(200, { kind: "zone", zone, level: 2, reason: "standard" }),
};

/**
 * The fake server. `conflicts` are the routes ("METHOD path") that answer `idempotency.key_conflict` once, as the server does
 * for a key that comes back with another body (US-QS-03).
 */
function fakeServer(
  start: { zones?: unknown[]; locations?: unknown[]; conflicts?: string[] } = {},
) {
  const data: Data = { zones: start.zones ?? [], locations: start.locations ?? [] };
  const conflicts = new Set(start.conflicts ?? []);
  const calls: { method: string; url: string; body: unknown; key: string | undefined }[] = [];
  const fetchFn = vi.fn<typeof fetch>(async (url, init) => {
    const path = new URL(String(url)).pathname;
    const method = init?.method ?? "GET";
    const body = init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined;
    const header = init?.headers as Record<string, string>;
    calls.push({ method, url: path, body, key: header["Idempotency-Key"] });
    if (conflicts.delete(`${method} ${path}`))
      return response(409, {
        error: { code: "idempotency.key_conflict", text: "raw server text" },
      });
    return (ROUTES[`${method} ${path}`] ?? (() => response(404, {})))(data, body);
  });
  vi.stubGlobal("fetch", fetchFn);
  return { fetchFn, calls };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => setViewportWidth(1024));

/** The first button of that name: from 768 px the "+" of a list is in the column header and in the segment row (hidden on a desktop). */
const pressFirst = (name: string) =>
  userEvent.click(screen.getAllByRole("button", { name })[0] as HTMLElement);
const REFERENCE = "Lichtbedarf und Einstufung";

describe("US-LIC-05 page locations and light zones", () => {
  it("US-LIC-04 the page shows the classification rules with the zone table of the account", async () => {
    fakeServer({ zones: [zone], locations: [] });
    render(<LightPage api="http://api" token={async () => "tok"} />);
    await userEvent.click(await screen.findByRole("button", { name: REFERENCE }));
    await userEvent.click(screen.getByRole("button", { name: "Regeln" }));
    expect(await screen.findByRole("heading", { name: "Einstufungsregeln" })).toBeTruthy();
    // US-QS-32: the zones are one grouped list, a labelled region with one row per zone.
    expect(screen.getByRole("region", { name: "Deine Lichtzonen" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Deine Lichtzonen", level: 3 })).toBeTruthy();
    // US-QS-15: the parts of the layer are one scroll list, so the last one is there without a page turn.
    expect(screen.queryByRole("button", { name: "Weiter" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Warnzeichen" })).toBeTruthy();
  });

  it("US-QS-19 the page heading comes first; the reference is a layer, not a column below the lists", async () => {
    fakeServer({ zones: [zone], locations: [location] });
    render(<LightPage api="http://api" token={async () => "tok"} />);
    await screen.findByRole("button", { name: /^Zone 2\b/ });
    const headings = screen.getAllByRole("heading");
    expect(headings[0]).toMatchObject({ tagName: "H1", textContent: "Standorte und Lichtzonen" });
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "Einstufungsregeln" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Lichtbedarf" })).toBeNull();
  });

  it("shows a status while loading and then zone and location from the API", async () => {
    fakeServer({ zones: [zone], locations: [location] });
    delayLoads();
    render(<LightPage api="http://api" token={async () => "tok"} />);
    expect((await screen.findByRole("status")).textContent).toContain("werden geladen");
    expect(await screen.findByRole("button", { name: /^Zone 2\b/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Balkon\b/ })).toBeTruthy();
  });

  it('without sign-in: error text with action "Erneut versuchen", no call to the API (P-09)', async () => {
    const { fetchFn } = fakeServer();
    const token = vi.fn<() => Promise<string | undefined>>(async () => undefined);
    render(<LightPage api="http://api" token={token} />);
    expect((await screen.findByRole("alert")).textContent).toContain(SIGNED_OUT);
    expect(fetchFn).not.toHaveBeenCalled();
    token.mockResolvedValue("tok");
    fakeServer({ zones: [zone] });
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(await screen.findByRole("button", { name: /^Zone 2\b/ })).toBeTruthy();
  });

  it("a server error while loading is shown with its text, nothing is shown half", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        response(500, { error: { code: "server.error", text: "raw server text" } }),
      ),
    );
    render(<LightPage api="http://api" token={async () => "tok"} />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Es ist ein Fehler aufgetreten");
    expect(alert.textContent).not.toContain("raw server text");
  });

  it("US-LIC-03 a failing overview request keeps zones and locations usable and offers a retry", async () => {
    const { fetchFn } = fakeServer({ zones: [zone], locations: [location] });
    const normal = fetchFn.getMockImplementation() as typeof fetch;
    fetchFn.mockImplementation(async (url, init) =>
      new URL(String(url)).pathname === "/specimens/light-overview"
        ? response(500, { error: { code: "server.error", text: "raw server text" } })
        : normal(url, init),
    );
    render(<LightPage api="http://api" token={async () => "tok"} />);
    await userEvent.click(await screen.findByRole("button", { name: REFERENCE }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Es ist ein Fehler aufgetreten",
    );
    expect(screen.getByRole("button", { name: /^Zone 2\b/ })).toBeTruthy();
    fetchFn.mockImplementation(normal);
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(await screen.findByText(/Noch keine Art: lege zuerst eine Pflanze an\./)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("creates a zone: sends with Idempotency-Key and reloads afterwards", async () => {
    const { calls } = fakeServer();
    render(<LightPage api="http://api" token={async () => "tok"} />);
    await screen.findByText("Noch keine Lichtzonen", { exact: false });
    await pressFirst("Neue Lichtzone");
    await userEvent.type(
      screen.getByLabelText("Name", { selector: "form[aria-label='Lichtzone anlegen'] input" }),
      "Fensterbank",
    );
    await userEvent.type(screen.getByLabelText("Lux-Obergrenze"), "8000");
    await userEvent.click(screen.getByRole("button", { name: "Lichtzone anlegen" }));
    expect(await screen.findByRole("button", { name: /^Fensterbank\b/ })).toBeTruthy();
    const post = calls.find((a) => a.method === "POST" && a.url === "/light-zones");
    expect(post?.body).toEqual({
      name: "Fensterbank",
      luxCeiling: 8000,
      ppfd: null,
      sortOrder: null,
    });
    expect(post?.key).toBeTruthy();
  });

  it("US-QS-32 · SG-BTN-01 the '+' of a list is a tinted icon button without a border, and the page has no filled button (FX-39 sweep 3)", async () => {
    fakeServer({ zones: [zone], locations: [location] });
    const { container } = render(<LightPage api="http://api" token={async () => "tok"} />);
    await screen.findByRole("button", { name: /^Zone 2\b/ });
    for (const name of ["Neue Lichtzone", "Neuer Standort"]) {
      const add = screen.getAllByRole("button", { name })[0] as HTMLElement;
      expect(isTinted(add), name).toBe(true);
      expect(hasOwnBorder(add), name).toBe(false);
    }
    expect(filledIn(container)).toEqual([]);
  });

  it("creates a location without zone and names it in the list afterwards", async () => {
    const { calls } = fakeServer({ zones: [zone] });
    render(<LightPage api="http://api" token={async () => "tok"} />);
    await screen.findByRole("button", { name: /^Zone 2\b/ });
    await pressFirst("Neuer Standort");
    await userEvent.type(
      screen.getByLabelText("Name", { selector: "form[aria-label='Standort anlegen'] input" }),
      "Fensterbank",
    );
    await userEvent.selectOptions(
      screen.getAllByLabelText("Innen oder außen")[0] as HTMLElement,
      "outdoor",
    );
    await userEvent.click(screen.getByRole("button", { name: "Standort anlegen" }));
    expect(await screen.findByRole("button", { name: /^Fensterbank\b/ })).toBeTruthy();
    const post = calls.find((a) => a.method === "POST" && a.url === "/locations");
    expect(post?.body).toEqual({ name: "Fensterbank", lightZoneId: null, kind: "outdoor" });
  });

  it("a rejected write shows the error text of the API and keeps offering the action", async () => {
    fakeServer();
    render(<LightPage api="http://api" token={async () => "tok"} />);
    await userEvent.click(await screen.findByRole("button", { name: "Standard-Zonen übernehmen" }));
    expect((await screen.findAllByText(/Du hast schon Lichtzonen/)).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Standard-Zonen übernehmen" })).toBeTruthy();
  });

  it("changes a zone: the form shows the old values, after saving the new name is there", async () => {
    const { calls } = fakeServer({ zones: [zone] });
    render(<LightPage api="http://api" token={async () => "tok"} />);
    await userEvent.click(await screen.findByRole("button", { name: /^Zone 2\b/ }));
    const name = screen.getByLabelText("Name", {
      selector: "form[aria-label='Zone 2 ändern'] input",
    });
    expect((name as HTMLInputElement).value).toBe("Zone 2");
    await userEvent.clear(name);
    await userEvent.type(name, "Zone 3");
    await userEvent.click(screen.getByRole("button", { name: "Sichern" }));
    expect(await screen.findByRole("button", { name: /^Zone 3\b/ })).toBeTruthy();
    const put = calls.find((a) => a.method === "PUT");
    expect(put?.body).toMatchObject({ name: "Zone 3", luxCeiling: 15000, ppfd: 300 });
  });

  it("cancel while changing discards the input without a write call", async () => {
    const { calls } = fakeServer({ zones: [zone] });
    render(<LightPage api="http://api" token={async () => "tok"} />);
    await userEvent.click(await screen.findByRole("button", { name: /^Zone 2\b/ }));
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.getByRole("button", { name: /^Zone 2\b/ })).toBeTruthy();
    expect(calls.every((a) => a.method === "GET")).toBe(true);
  });

  it("US-QS-19 deleting is only in the layer of the zone, asks first; a used zone stays with the error text of the API", async () => {
    const { calls } = fakeServer({ zones: [zone] });
    render(<LightPage api="http://api" token={async () => "tok"} />);
    await userEvent.click(await screen.findByRole("button", { name: /^Zone 2\b/ }));
    await userEvent.click(screen.getByRole("button", { name: "Lichtzone löschen" }));
    expect(calls.some((a) => a.method === "DELETE")).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "„Zone 2“ löschen" }));
    expect((await screen.findAllByText(/wird noch genutzt/)).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /^Zone 2\b/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lichtzone löschen" })).toBeTruthy();
  });

  it("US-QS-32 · SG-BTN-03 'Lichtzone löschen' is a red plain button and the last action of the layer", async () => {
    fakeServer({ zones: [zone] });
    render(<LightPage api="http://api" token={async () => "tok"} />);
    await userEvent.click(await screen.findByRole("button", { name: /^Zone 2\b/ }));
    const remove = screen.getByRole("button", { name: "Lichtzone löschen" });
    expect(remove.className.split(/\s+/)).toContain("text-destructive");
    expect(remove.className.split(/\s+/).some((c) => /^bg-/.test(c))).toBe(false);
    // The layer's own wrapper holds its form and the delete control; the control comes last in it.
    const layer = remove.parentElement as HTMLElement;
    expect(layer.querySelectorAll("button").item(layer.querySelectorAll("button").length - 1)).toBe(
      remove,
    );
  });

  it("US-QS-19 deleting can be cancelled; the rows have no delete button", async () => {
    fakeServer({ zones: [zone] });
    render(<LightPage api="http://api" token={async () => "tok"} />);
    expect(screen.queryByRole("button", { name: "Löschen" })).toBeNull();
    await userEvent.click(await screen.findByRole("button", { name: /^Zone 2\b/ }));
    await userEvent.click(screen.getByRole("button", { name: "Lichtzone löschen" }));
    await userEvent.click(screen.getByRole("button", { name: "Nicht löschen" }));
    expect(screen.getByRole("button", { name: "Lichtzone löschen" })).toBeTruthy();
  });

  it("assigns a light zone to a location without zone", async () => {
    const { calls } = fakeServer({ zones: [zone], locations: [location] });
    render(<LightPage api="http://api" token={async () => "tok"} />);
    await userEvent.click(await screen.findByRole("button", { name: /^Balkon\b/ }));
    await userEvent.selectOptions(
      screen.getByLabelText("Lichtzone", { selector: "form[aria-label='Balkon ändern'] select" }),
      "z1",
    );
    await userEvent.click(screen.getByRole("button", { name: "Sichern" }));
    expect(await screen.findByText("Zone 2 · außen")).toBeTruthy();
    expect(calls.find((a) => a.url === "/locations/s1")?.body).toEqual({
      name: "Balkon",
      lightZoneId: "z1",
      kind: "outdoor",
    });
  });
});

/** The notice of a refusal inside the form that was sent (the alert the layer shows, US-QS-03). */
const DISMISS = { name: "Hinweis schließen" };

describe("US-QS-03 · P-10 a key conflict of a new zone or location can be dismissed", () => {
  it("US-QS-03 a key conflict of a new zone offers Hinweis schließen: it clears the note, keeps the input, returns the focus and frees the key", async () => {
    const { calls } = fakeServer({ conflicts: ["POST /light-zones"] });
    render(<LightPage api="http://api" token={async () => "tok"} />);
    await screen.findByText("Noch keine Lichtzonen", { exact: false });
    await pressFirst("Neue Lichtzone");
    const form = screen.getByRole("form", { name: "Lichtzone anlegen" });
    await userEvent.type(within(form).getByLabelText("Name"), "Fensterbank");
    await userEvent.type(within(form).getByLabelText("Lux-Obergrenze"), "8000");
    // The confirming action stands in the bar of the layer, outside the form, and submits it by its id (US-QS-32, d-115).
    const submit = screen.getByRole("button", { name: "Lichtzone anlegen" });
    await userEvent.click(submit);
    const note = await screen.findByRole("alert");
    // The conflict keeps its key: the next press would send it again, so the note gives the keeper the way on.
    await userEvent.click(within(note).getByRole("button", DISMISS));
    expect(screen.queryByRole("alert")).toBeNull();
    expect((within(form).getByLabelText("Name") as HTMLInputElement).value).toBe("Fensterbank");
    expect(document.activeElement).toBe(submit);
    await userEvent.click(submit);
    expect(await screen.findByRole("button", { name: /^Fensterbank\b/ })).toBeTruthy();
    const keys = calls.filter((a) => a.method === "POST" && a.url === "/light-zones");
    expect(keys).toHaveLength(2);
    expect(keys[0]?.key).toBeTruthy();
    expect(keys[1]?.key).toBeTruthy();
    expect(keys[1]?.key).not.toBe(keys[0]?.key);
  });

  it("US-QS-03 a key conflict of a new location offers Hinweis schließen: it clears the note, returns the focus and frees the key", async () => {
    const { calls } = fakeServer({ zones: [zone], conflicts: ["POST /locations"] });
    render(<LightPage api="http://api" token={async () => "tok"} />);
    await screen.findByRole("button", { name: /^Zone 2\b/ });
    await pressFirst("Neuer Standort");
    const form = screen.getByRole("form", { name: "Standort anlegen" });
    await userEvent.type(within(form).getByLabelText("Name"), "Fensterbank");
    const submit = screen.getByRole("button", { name: "Standort anlegen" });
    await userEvent.click(submit);
    const note = await screen.findByRole("alert");
    await userEvent.click(within(note).getByRole("button", DISMISS));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.activeElement).toBe(submit);
    await userEvent.click(submit);
    expect(await screen.findByRole("button", { name: /^Fensterbank\b/ })).toBeTruthy();
    const keys = calls.filter((a) => a.method === "POST" && a.url === "/locations");
    expect(keys).toHaveLength(2);
    expect(keys[1]?.key).toBeTruthy();
    expect(keys[1]?.key).not.toBe(keys[0]?.key);
  });

  it("US-QS-03 a key conflict of a change to a zone shows its note without Hinweis schließen: its key is freed at once", async () => {
    const { calls } = fakeServer({ zones: [zone], conflicts: ["PUT /light-zones/z1"] });
    render(<LightPage api="http://api" token={async () => "tok"} />);
    await userEvent.click(await screen.findByRole("button", { name: /^Zone 2\b/ }));
    const form = await screen.findByRole("form", { name: "Zone 2 ändern" });
    await userEvent.clear(within(form).getByLabelText("Name"));
    await userEvent.type(within(form).getByLabelText("Name"), "Zone 3");
    await userEvent.click(screen.getByRole("button", { name: "Sichern" }));
    const note = await screen.findByRole("alert");
    expect(within(note).queryByRole("button", DISMISS)).toBeNull();
    // The next press is a fresh write under a key of its own.
    await userEvent.click(screen.getByRole("button", { name: "Sichern" }));
    await waitFor(() =>
      expect(calls.filter((a) => a.method === "PUT" && a.url === "/light-zones/z1")).toHaveLength(
        2,
      ),
    );
    const keys = calls.filter((a) => a.method === "PUT").map((a) => a.key);
    expect(keys[1]).not.toBe(keys[0]);
  });
});

describe("US-QS-14 feedback on the light page", () => {
  it("US-QS-14 a saved location is confirmed with a toast", async () => {
    fakeServer({ zones: [zone], locations: [location] });
    render(<LightPage api="http://api" token={async () => "tok"} />);
    await userEvent.click(await screen.findByRole("button", { name: /^Balkon\b/ }));
    await userEvent.click(screen.getByRole("button", { name: "Sichern" }));
    expect(await screen.findByText("Standort gesichert.")).toBeTruthy();
  });

  it("US-QS-32 · F-0005 · SG-FEED-01 a deleted zone is gone from its list and said by the live region: no toast, the layer closes", async () => {
    const refuse = ROUTES["DELETE /light-zones/z1"] as Route;
    ROUTES["DELETE /light-zones/z1"] = async (d) => {
      d.zones.length = 0;
      return response(200, {});
    };
    try {
      fakeServer({ zones: [zone] });
      render(<LightPage api="http://api" token={async () => "tok"} />);
      await userEvent.click(await screen.findByRole("button", { name: /^Zone 2\b/ }));
      await userEvent.click(screen.getByRole("button", { name: "Lichtzone löschen" }));
      await userEvent.click(screen.getByRole("button", { name: "„Zone 2“ löschen" }));
      await waitFor(() => expect(said()).toBe("Lichtzone gelöscht."));
      await waitFor(() => expect(screen.queryByRole("button", { name: /^Zone 2\b/ })).toBeNull());
      expect(screen.queryByRole("dialog")).toBeNull();
      // The announcer is the one place that holds the text: no toast repeats it.
      expect(
        screen.queryAllByText("Lichtzone gelöscht.").filter((e) => !e.hasAttribute("aria-live")),
      ).toEqual([]);
    } finally {
      ROUTES["DELETE /light-zones/z1"] = refuse;
    }
  });

  it("US-QS-32 · SG-BASE-01 after a deleted zone the focus lands on the heading of the list view, not on the body (issue 2465)", async () => {
    const refuse = ROUTES["DELETE /light-zones/z1"] as Route;
    ROUTES["DELETE /light-zones/z1"] = async (d) => {
      d.zones.length = 0;
      return response(200, {});
    };
    try {
      fakeServer({ zones: [zone] });
      render(
        <main id="inhalt">
          <LightPage api="http://api" token={async () => "tok"} />
        </main>,
      );
      await userEvent.click(await screen.findByRole("button", { name: /^Zone 2\b/ }));
      await userEvent.click(screen.getByRole("button", { name: "Lichtzone löschen" }));
      await userEvent.click(screen.getByRole("button", { name: "„Zone 2“ löschen" }));
      await waitFor(() => expect(said()).toBe("Lichtzone gelöscht."));
      await waitFor(() => expect(screen.queryByRole("button", { name: /^Zone 2\b/ })).toBeNull());
      const heading = screen.getByRole("heading", { level: 1, name: "Standorte und Lichtzonen" });
      await waitFor(() => expect(document.activeElement).toBe(heading));
    } finally {
      ROUTES["DELETE /light-zones/z1"] = refuse;
    }
  });

  it("US-QS-32 · SG-BASE-01 a refused delete keeps the focus where it was: no move to the heading (issue 2465)", async () => {
    fakeServer({ zones: [zone] });
    render(
      <main id="inhalt">
        <LightPage api="http://api" token={async () => "tok"} />
      </main>,
    );
    await userEvent.click(await screen.findByRole("button", { name: /^Zone 2\b/ }));
    await userEvent.click(screen.getByRole("button", { name: "Lichtzone löschen" }));
    await userEvent.click(screen.getByRole("button", { name: "„Zone 2“ löschen" }));
    expect((await screen.findAllByText(/wird noch genutzt/)).length).toBeGreaterThan(0);
    const heading = screen.getByRole("heading", { level: 1, name: "Standorte und Lichtzonen" });
    expect(document.activeElement).not.toBe(heading);
  });

  it("US-QS-14 a refused write shows no success toast", async () => {
    fakeServer({ zones: [], locations: [] });
    render(<LightPage api="http://api" token={async () => "tok"} />);
    await userEvent.click(await screen.findByRole("button", { name: "Standard-Zonen übernehmen" }));
    await screen.findByRole("alert");
    expect(screen.queryByText("Standard-Zonen übernommen.")).toBeNull();
  });

  it("US-QS-14 a location without light zone shows a banner that says what to do", async () => {
    fakeServer({ zones: [zone], locations: [location] });
    render(<LightPage api="http://api" token={async () => "tok"} />);
    await userEvent.click(await screen.findByRole("button", { name: "Hinweise (1)" }));
    expect(await screen.findByText("Lichtzone fehlt")).toBeTruthy();
    expect(screen.getByText(/Für Balkon fehlt die Lichtzone/)).toBeTruthy();
  });
});

describe("US-LIC-01 determine the zone of a species on the page", () => {
  it("queries the derivation of the API and shows zone and reason", async () => {
    const { calls } = fakeServer({ zones: [zone] });
    render(<LightPage api="http://api" token={async () => "tok"} />);
    await screen.findByRole("button", { name: /^Zone 2\b/ });
    await userEvent.click(screen.getByRole("button", { name: REFERENCE }));
    await userEvent.click(screen.getByRole("button", { name: "Rechner" }));
    await userEvent.type(screen.getByLabelText("Lichtbedarf der Art"), "15000");
    await userEvent.click(screen.getByRole("button", { name: "Zone ermitteln" }));
    expect(await screen.findByText("Lichtzone: Zone 2")).toBeTruthy();
    const get = calls.find((a) => a.url === "/light-zones/derivation");
    expect(get?.method).toBe("GET");
  });

  it("without sign-in while determining: error text instead of a call to the API", async () => {
    fakeServer({ zones: [zone] });
    let signedIn = true;
    const token = async () => (signedIn ? "tok" : undefined);
    render(<LightPage api="http://api" token={token} />);
    await screen.findByRole("button", { name: /^Zone 2\b/ });
    await userEvent.click(screen.getByRole("button", { name: REFERENCE }));
    await userEvent.click(screen.getByRole("button", { name: "Rechner" }));
    signedIn = false;
    await userEvent.type(screen.getByLabelText("Lichtbedarf der Art"), "15000");
    await userEvent.click(screen.getByRole("button", { name: "Zone ermitteln" }));
    expect((await screen.findAllByText(SIGNED_OUT)).length).toBeGreaterThan(0);
  });
});

describe("US-LIC-05 · DS-48 forms and refusals", () => {
  it("an invalid zone form sends nothing, focuses the first invalid field and links its German message", async () => {
    const { calls } = fakeServer();
    render(<LightPage api="http://api" token={async () => "tok"} />);
    await screen.findByText("Noch keine Lichtzonen", { exact: false });
    await pressFirst("Neue Lichtzone");
    await userEvent.click(screen.getByRole("button", { name: "Lichtzone anlegen" }));
    const name = screen.getByLabelText("Name", {
      selector: "form[aria-label='Lichtzone anlegen'] input",
    });
    expect(document.activeElement).toBe(name);
    expect(name.getAttribute("aria-invalid")).toBe("true");
    const message = await screen.findByText("Gib einen Namen ein.");
    expect(name.getAttribute("aria-describedby")).toContain(message.id);
    expect(calls.some((a) => a.method === "POST")).toBe(false);
  });

  it("a refused field shows the German text of its error code, not the raw server text, and takes the focus", async () => {
    fakeServer();
    ROUTES["POST /light-zones"] = async () =>
      response(409, {
        error: {
          code: "light_zone.name_taken",
          text: "raw server text",
          details: [{ field: "name", code: "light_zone.name_taken" }],
        },
      });
    render(<LightPage api="http://api" token={async () => "tok"} />);
    await screen.findByText("Noch keine Lichtzonen", { exact: false });
    await pressFirst("Neue Lichtzone");
    const name = screen.getByLabelText("Name", {
      selector: "form[aria-label='Lichtzone anlegen'] input",
    });
    await userEvent.type(name, "Zone 2");
    await userEvent.type(screen.getByLabelText("Lux-Obergrenze"), "8000");
    await userEvent.click(screen.getByRole("button", { name: "Lichtzone anlegen" }));
    expect(await screen.findByText("Eine Lichtzone mit diesem Namen gibt es schon.")).toBeTruthy();
    expect(screen.queryByText(/raw server text/)).toBeNull();
    expect(document.activeElement).toBe(name);
    expect((name as HTMLInputElement).value).toBe("Zone 2");
  });

  it("no locations yet: the empty state offers to create the first one and moves the focus to its name", async () => {
    fakeServer({ zones: [zone] });
    render(<LightPage api="http://api" token={async () => "tok"} />);
    await userEvent.click(await screen.findByRole("button", { name: "Ersten Standort anlegen" }));
    expect(screen.getByRole("heading", { name: "Neuer Standort" })).toBeTruthy();
    expect(
      screen.getByLabelText("Name", { selector: "form[aria-label='Standort anlegen'] input" }),
    ).toBeTruthy();
  });
});

describe("US-QS-19 management on one screen", () => {
  it("US-QS-19 · issue 1155 the zones and the locations page by the free height of the view", async () => {
    setViewportWidth(1024);
    fakeServer({ zones: [zone], locations: [location] });
    render(<LightPage api="http://api" token={async () => "tok"} />);
    for (const name of ["Lichtzonen", "Standorte"]) {
      const list = await screen.findByRole("list", { name });
      expect(list.hasAttribute("data-page-fit")).toBe(true);
    }
  });

  const locationsSeven = Array.from({ length: 7 }, (_, i) => ({
    id: `s${i + 1}`,
    name: `Standort ${i + 1}`,
    lightZoneId: "z1",
    kind: "indoor" as const,
  }));

  it("US-QS-19 on a phone the zones and the locations are two segments with their counts; one list at a time", async () => {
    setViewportWidth(360);
    fakeServer({ zones: [zone], locations: [location] });
    render(<LightPage api="http://api" token={async () => "tok"} />);
    await screen.findByRole("button", { name: /^Zone 2\b/ });
    expect(
      screen.getByRole("button", { name: "Lichtzonen (1)" }).getAttribute("aria-pressed"),
    ).toBe("true");
    await userEvent.click(screen.getByRole("button", { name: "Standorte (1)" }));
    expect(screen.getByRole("button", { name: "Standorte (1)" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByRole("region", { name: "Lichtzonen" }).className).toContain("hidden");
    expect(screen.getByRole("region", { name: "Standorte" }).className).not.toContain("hidden");
  });

  it("US-QS-19 · US-QS-32 a phone lists the locations in one scrolling list of compact rows: all seven, and no page is turned", async () => {
    setViewportWidth(360);
    fakeServer({ zones: [zone], locations: locationsSeven });
    render(<LightPage api="http://api" token={async () => "tok"} />);
    await userEvent.click(await screen.findByRole("button", { name: "Standorte (7)" }));
    const list = screen.getByRole("list", { name: "Standorte" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(7);
    expect(within(list).getByText("Standort 7")).toBeTruthy();
    expect(screen.queryByText(/^Seite \d+ von \d+$/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Weiter" })).toBeNull();
  });

  it("US-QS-32 each zone and location is one button named by its visible text, with a chevron, and its layer holds the form", async () => {
    fakeServer({ zones: [zone], locations: [location] });
    render(<LightPage api="http://api" token={async () => "tok"} />);
    const zoneRow = await screen.findByRole("button", { name: /^Zone 2\b/ });
    expect(zoneRow.textContent).toContain("bis 15.000");
    expect(zoneRow.querySelector("svg")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /ändern$/ })).toBeNull();
    const locationRow = screen.getByRole("button", { name: /^Balkon\b/ });
    expect(locationRow.querySelector("svg")).not.toBeNull();
    expect(screen.getByText(/^bis 15\.000/)).toBeTruthy();
    expect(screen.getByText("Lichtzone fehlt · außen")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /^Balkon\b/ }));
    expect(
      screen.getByLabelText("Name", { selector: "form[aria-label='Balkon ändern'] input" }),
    ).toBeTruthy();
  });

  it("US-QS-15 · US-QS-19 the reference layer shows one part at a time; its lists are scroll content, never pages (issue 1155)", async () => {
    setViewportWidth(360);
    const { fetchFn } = fakeServer({ zones: [zone], locations: [] });
    const normal = fetchFn.getMockImplementation() as typeof fetch;
    const row = (id: string) => ({
      speciesId: id,
      speciesName: `Art ${id}`,
      lightDemandLux: 15000,
      position: null,
      zone,
    });
    fetchFn.mockImplementation(async (url, init) =>
      new URL(String(url)).pathname === "/specimens/light-overview"
        ? response(200, { rows: [row("a"), row("b"), row("c")] })
        : normal(url, init),
    );
    render(<LightPage api="http://api" token={async () => "tok"} />);
    await userEvent.click(await screen.findByRole("button", { name: REFERENCE }));
    expect(
      (await screen.findByRole("button", { name: "Lichtbedarf" })).getAttribute("aria-pressed"),
    ).toBe("true");
    // The species are the scroll content of the layer (US-QS-15): no page of its own, no marker of a paging list.
    const list = screen.getByRole("list", { name: "Lichtbedarf der Arten" });
    expect(list.hasAttribute("data-page-fit")).toBe(false);
    expect(screen.queryByRole("button", { name: "Weiter" })).toBeNull();
    for (const name of ["Art a", "Art b", "Art c"])
      expect(within(list).getByText(name)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Regeln" }));
    expect(screen.queryByText("Art c")).toBeNull();
    expect(screen.getByRole("heading", { name: "Einstufungsregeln" })).toBeTruthy();
  });
});

const QUESTION = { name: "Eingabe verwerfen?" };
const ZONE_NAME = "form[aria-label='Zone 2 ändern'] input";

describe("US-QS-32 the light layers ask before they discard typed input", () => {
  it("US-QS-15 · SG-SHEET-04 the save of Lichtzone ändern stands in the bar of the sheet beside Abbrechen, never at the end of the content", async () => {
    setViewportWidth(360);
    fakeServer({ zones: [zone] });
    render(<LightPage api="http://api" token={async () => "tok"} />);
    await userEvent.click(await screen.findByRole("button", { name: /^Zone 2\b/ }));
    const sheet = await screen.findByRole("dialog", { name: "Lichtzone ändern" });
    const bar = await waitFor(() => {
      const found = sheet.querySelector<HTMLElement>("[data-form-bar]");
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    expect(within(bar).getByRole("button", { name: "Sichern" })).toBeTruthy();
    expect(within(bar).getByRole("button", { name: "Abbrechen" })).toBeTruthy();
    expect(sheet.querySelector("form")?.contains(bar)).toBe(false);
  });

  it("US-QS-32 Lichtzone ändern: typed name and Escape asks; Weiter bearbeiten keeps the value and the layer", async () => {
    fakeServer({ zones: [zone] });
    render(<LightPage api="http://api" token={async () => "tok"} />);
    await userEvent.click(await screen.findByRole("button", { name: /^Zone 2\b/ }));
    await userEvent.type(screen.getByLabelText("Name", { selector: ZONE_NAME }), " neu");
    await userEvent.keyboard("{Escape}");
    const question = await screen.findByRole("dialog", QUESTION);
    await userEvent.click(within(question).getByRole("button", { name: "Weiter bearbeiten" }));
    await waitFor(() => expect(screen.queryByRole("dialog", QUESTION)).toBeNull());
    expect((screen.getByLabelText("Name", { selector: ZONE_NAME }) as HTMLInputElement).value).toBe(
      "Zone 2 neu",
    );
  });

  it("US-QS-32 Lichtzone ändern: typed name and Back asks; Eingabe verwerfen closes the layer and writes nothing", async () => {
    const { calls } = fakeServer({ zones: [zone] });
    render(<LightPage api="http://api" token={async () => "tok"} />);
    await userEvent.click(await screen.findByRole("button", { name: /^Zone 2\b/ }));
    await userEvent.type(screen.getByLabelText("Name", { selector: ZONE_NAME }), " neu");
    // The first input pushes the guard entry; Back is pressed once that entry is committed, as the Back tests of US-QS-15 do.
    await waitFor(() => expect(route.guarded).toBe(true));
    back();
    const question = await screen.findByRole("dialog", QUESTION);
    await userEvent.click(within(question).getByRole("button", { name: "Eingabe verwerfen" }));
    await waitFor(() =>
      expect(screen.queryByLabelText("Name", { selector: ZONE_NAME })).toBeNull(),
    );
    expect(route.search).not.toContain("sheet=zone-z1");
    expect(calls.every((a) => a.method === "GET")).toBe(true);
  });

  it("US-QS-32 Lichtzone ändern without typed input: Escape closes the layer at once, with no question", async () => {
    fakeServer({ zones: [zone] });
    render(<LightPage api="http://api" token={async () => "tok"} />);
    await userEvent.click(await screen.findByRole("button", { name: /^Zone 2\b/ }));
    await screen.findByLabelText("Name", { selector: ZONE_NAME });
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByLabelText("Name", { selector: ZONE_NAME })).toBeNull(),
    );
    expect(screen.queryByRole("dialog", QUESTION)).toBeNull();
  });

  it("US-QS-32 Lichtzone ändern: Abbrechen after typed input closes the layer without a question", async () => {
    const { calls } = fakeServer({ zones: [zone] });
    render(<LightPage api="http://api" token={async () => "tok"} />);
    await userEvent.click(await screen.findByRole("button", { name: /^Zone 2\b/ }));
    await userEvent.type(screen.getByLabelText("Name", { selector: ZONE_NAME }), " neu");
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    await waitFor(() =>
      expect(screen.queryByLabelText("Name", { selector: ZONE_NAME })).toBeNull(),
    );
    expect(screen.queryByRole("dialog", QUESTION)).toBeNull();
    expect(calls.every((a) => a.method === "GET")).toBe(true);
  });

  it("US-QS-32 Lichtzone ändern: a saved change closes the layer without a question", async () => {
    fakeServer({ zones: [zone] });
    render(<LightPage api="http://api" token={async () => "tok"} />);
    await userEvent.click(await screen.findByRole("button", { name: /^Zone 2\b/ }));
    await userEvent.type(screen.getByLabelText("Name", { selector: ZONE_NAME }), " neu");
    await userEvent.click(screen.getByRole("button", { name: "Sichern" }));
    expect(await screen.findByRole("button", { name: /^Zone 2 neu\b/ })).toBeTruthy();
    await waitFor(() =>
      expect(screen.queryByLabelText("Name", { selector: ZONE_NAME })).toBeNull(),
    );
    expect(screen.queryByRole("dialog", QUESTION)).toBeNull();
  });

  it("US-QS-32 Standort ändern: typed name and Escape asks", async () => {
    fakeServer({ zones: [zone], locations: [location] });
    render(<LightPage api="http://api" token={async () => "tok"} />);
    await userEvent.click(await screen.findByRole("button", { name: /^Balkon\b/ }));
    await userEvent.type(
      screen.getByLabelText("Name", { selector: "form[aria-label='Balkon ändern'] input" }),
      " Süd",
    );
    await userEvent.keyboard("{Escape}");
    expect(await screen.findByRole("dialog", QUESTION)).toBeTruthy();
  });

  it("US-QS-32 Lichtzone anlegen: typed name and Escape asks", async () => {
    fakeServer();
    render(<LightPage api="http://api" token={async () => "tok"} />);
    await screen.findByText("Noch keine Lichtzonen", { exact: false });
    await pressFirst("Neue Lichtzone");
    await userEvent.type(
      screen.getByLabelText("Name", { selector: "form[aria-label='Lichtzone anlegen'] input" }),
      "Fensterbank",
    );
    await userEvent.keyboard("{Escape}");
    expect(await screen.findByRole("dialog", QUESTION)).toBeTruthy();
  });

  it("US-QS-32 Standort anlegen: typed name and Escape asks", async () => {
    fakeServer({ zones: [zone] });
    render(<LightPage api="http://api" token={async () => "tok"} />);
    await screen.findByRole("button", { name: /^Zone 2\b/ });
    await pressFirst("Neuer Standort");
    await userEvent.type(
      screen.getByLabelText("Name", { selector: "form[aria-label='Standort anlegen'] input" }),
      "Fensterbank",
    );
    await userEvent.keyboard("{Escape}");
    expect(await screen.findByRole("dialog", QUESTION)).toBeTruthy();
  });
});

// The one-screen gate (QG-U8, the CI jobs one-screen, layout shift and a11y-routes) clicks the rows of these two screens by
// the steps of the register. The page must name the rows so: a step that finds no row times out in CI (US-QS-32).
// The tests run in the web package (npm run test -w), so the register is two folders up from there.
const REGISTER = JSON.parse(
  readFileSync(resolve(process.cwd(), "../e2e/support/display/screens.json"), "utf8"),
) as { id: string; steps?: { role: string; name?: string; re?: string }[] }[];

describe("US-QS-32 the rows of the light page are named by their visible text, as the one-screen steps name them", () => {
  for (const id of ["light-zone-edit", "light-location-edit"]) {
    it(`US-QS-32 every step of ${id} finds its row on the page`, async () => {
      const steps = REGISTER.find((s) => s.id === id)?.steps ?? [];
      expect(steps.length).toBeGreaterThan(0);
      fakeServer({
        zones: [zone],
        locations: [{ ...location, id: "s2", name: "Bad", lightZoneId: "z1" }],
      });
      render(<LightPage api="http://api" token={async () => "tok"} />);
      for (const step of steps) {
        // eslint-disable-next-line security/detect-non-literal-regexp -- the pattern comes from the checked-in register
        const name = step.re !== undefined ? new RegExp(step.re, "i") : (step.name ?? "");
        expect(
          await screen.findByRole(step.role as "button", { name }),
          `${id}: ${JSON.stringify(step)}`,
        ).toBeTruthy();
      }
    });
  }
});
