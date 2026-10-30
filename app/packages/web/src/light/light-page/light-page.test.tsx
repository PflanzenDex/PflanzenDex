// @vitest-environment jsdom
import { cleanup, render as plainRender, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/lib/viewport-mock";
import { ToastProvider } from "@/components/shared/states/toast/toast-provider/toast-provider";
import { LightPage } from "./light-page";

/** The page lives inside the app shell, which owns the toast provider (US-QS-14). */
const render = (ui: React.ReactElement) =>
  plainRender(
    <MemoryRouter>
      <ToastProvider>{ui}</ToastProvider>
    </MemoryRouter>,
  );

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

function fakeServer(start: { zones?: unknown[]; locations?: unknown[] } = {}) {
  const data: Data = { zones: start.zones ?? [], locations: start.locations ?? [] };
  const calls: { method: string; url: string; body: unknown; key: string | undefined }[] = [];
  const fetchFn = vi.fn<typeof fetch>(async (url, init) => {
    const path = new URL(String(url)).pathname;
    const method = init?.method ?? "GET";
    const body = init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined;
    const header = init?.headers as Record<string, string>;
    calls.push({ method, url: path, body, key: header["Idempotency-Key"] });
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
const REFERENCE = "Lichthunger und Einstufung";

describe("US-LIC-05 page locations and light zones", () => {
  it("US-LIC-04 the page shows the classification rules with the zone table of the account", async () => {
    fakeServer({ zones: [zone], locations: [] });
    render(
      <LightPage api="http://api" token={async () => "tok"} onOpenCollection={() => undefined} />,
    );
    await userEvent.click(await screen.findByRole("button", { name: REFERENCE }));
    expect(await screen.findByRole("heading", { name: "Einstufungsregeln" })).toBeTruthy();
    expect(screen.getByRole("table", { name: "Deine Lichtzonen" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Warnzeichen" })).toBeTruthy();
  });

  it("US-QS-19 the page heading comes first; the reference is a layer, not a column below the lists", async () => {
    fakeServer({ zones: [zone], locations: [location] });
    render(
      <LightPage api="http://api" token={async () => "tok"} onOpenCollection={() => undefined} />,
    );
    await screen.findByRole("heading", { name: "Zone 2" });
    const headings = screen.getAllByRole("heading");
    expect(headings[0]).toMatchObject({ tagName: "H1", textContent: "Standorte und Lichtzonen" });
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "Einstufungsregeln" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Lichthunger" })).toBeNull();
  });

  it("shows a status while loading and then zone and location from the API", async () => {
    fakeServer({ zones: [zone], locations: [location] });
    render(
      <LightPage api="http://api" token={async () => "tok"} onOpenCollection={() => undefined} />,
    );
    expect(screen.getByRole("status").textContent).toContain("werden geladen");
    expect(await screen.findByRole("heading", { name: "Zone 2" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Balkon" })).toBeTruthy();
  });

  it('without sign-in: error text with action "Erneut versuchen", no call to the API (P-09)', async () => {
    const { fetchFn } = fakeServer();
    const token = vi.fn<() => Promise<string | undefined>>(async () => undefined);
    render(<LightPage api="http://api" token={token} onOpenCollection={() => undefined} />);
    expect((await screen.findByRole("alert")).textContent).toContain(SIGNED_OUT);
    expect(fetchFn).not.toHaveBeenCalled();
    token.mockResolvedValue("tok");
    fakeServer({ zones: [zone] });
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(await screen.findByRole("heading", { name: "Zone 2" })).toBeTruthy();
  });

  it("a server error while loading is shown with its text, nothing is shown half", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        response(500, { error: { code: "server.error", text: "raw server text" } }),
      ),
    );
    render(
      <LightPage api="http://api" token={async () => "tok"} onOpenCollection={() => undefined} />,
    );
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
    render(
      <LightPage api="http://api" token={async () => "tok"} onOpenCollection={() => undefined} />,
    );
    await userEvent.click(await screen.findByRole("button", { name: REFERENCE }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Es ist ein Fehler aufgetreten",
    );
    expect(screen.getByRole("heading", { name: "Zone 2" })).toBeTruthy();
    fetchFn.mockImplementation(normal);
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(await screen.findByText(/noch keine arten/i)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("creates a zone: sends with Idempotency-Key and reloads afterwards", async () => {
    const { calls } = fakeServer();
    render(
      <LightPage api="http://api" token={async () => "tok"} onOpenCollection={() => undefined} />,
    );
    await screen.findByText("Noch keine Lichtzonen", { exact: false });
    await pressFirst("Neue Lichtzone");
    await userEvent.type(
      screen.getByLabelText("Name", { selector: "form[aria-label='Lichtzone anlegen'] input" }),
      "Fensterbank",
    );
    await userEvent.type(screen.getByLabelText("Lux-Decke (Lux)"), "8000");
    await userEvent.click(screen.getByRole("button", { name: "Zone anlegen" }));
    expect(await screen.findByRole("heading", { name: "Fensterbank" })).toBeTruthy();
    const post = calls.find((a) => a.method === "POST" && a.url === "/light-zones");
    expect(post?.body).toEqual({
      name: "Fensterbank",
      luxCeiling: 8000,
      ppfd: null,
      sortOrder: null,
    });
    expect(post?.key).toBeTruthy();
  });

  it("creates a location without zone and names it in the list afterwards", async () => {
    const { calls } = fakeServer({ zones: [zone] });
    render(
      <LightPage api="http://api" token={async () => "tok"} onOpenCollection={() => undefined} />,
    );
    await screen.findByRole("heading", { name: "Zone 2" });
    await pressFirst("Neuer Standort");
    await userEvent.type(
      screen.getByLabelText("Name", { selector: "form[aria-label='Standort anlegen'] input" }),
      "Fensterbank",
    );
    await userEvent.selectOptions(screen.getAllByLabelText("Art")[0] as HTMLElement, "outdoor");
    await userEvent.click(screen.getByRole("button", { name: "Standort anlegen" }));
    expect(await screen.findByRole("heading", { name: "Fensterbank" })).toBeTruthy();
    const post = calls.find((a) => a.method === "POST" && a.url === "/locations");
    expect(post?.body).toEqual({ name: "Fensterbank", lightZoneId: null, kind: "outdoor" });
  });

  it("a rejected write shows the error text of the API and keeps offering the action", async () => {
    fakeServer();
    render(
      <LightPage api="http://api" token={async () => "tok"} onOpenCollection={() => undefined} />,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Standard-Zonen übernehmen" }));
    expect((await screen.findAllByText(/Du hast schon Lichtzonen/)).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Standard-Zonen übernehmen" })).toBeTruthy();
  });

  it("changes a zone: the form shows the old values, after saving the new name is there", async () => {
    const { calls } = fakeServer({ zones: [zone] });
    render(
      <LightPage api="http://api" token={async () => "tok"} onOpenCollection={() => undefined} />,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Zone 2 ändern" }));
    const name = screen.getByLabelText("Name", {
      selector: "form[aria-label='Zone 2 ändern'] input",
    });
    expect((name as HTMLInputElement).value).toBe("Zone 2");
    await userEvent.clear(name);
    await userEvent.type(name, "Zone 3");
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(await screen.findByRole("heading", { name: "Zone 3" })).toBeTruthy();
    const put = calls.find((a) => a.method === "PUT");
    expect(put?.body).toMatchObject({ name: "Zone 3", luxCeiling: 15000, ppfd: 300 });
  });

  it("cancel while changing discards the input without a write call", async () => {
    const { calls } = fakeServer({ zones: [zone] });
    render(
      <LightPage api="http://api" token={async () => "tok"} onOpenCollection={() => undefined} />,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Zone 2 ändern" }));
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.getByRole("heading", { name: "Zone 2" })).toBeTruthy();
    expect(calls.every((a) => a.method === "GET")).toBe(true);
  });

  it("US-QS-19 deleting is only in the layer of the zone, asks first; a used zone stays with the error text of the API", async () => {
    const { calls } = fakeServer({ zones: [zone] });
    render(
      <LightPage api="http://api" token={async () => "tok"} onOpenCollection={() => undefined} />,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Zone 2 ändern" }));
    await userEvent.click(screen.getByRole("button", { name: "Lichtzone löschen" }));
    expect(calls.some((a) => a.method === "DELETE")).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Ja, „Zone 2“ löschen" }));
    expect((await screen.findAllByText(/wird noch genutzt/)).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Zone 2" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lichtzone löschen" })).toBeTruthy();
  });

  it("US-QS-19 deleting can be cancelled; the rows have no delete button", async () => {
    fakeServer({ zones: [zone] });
    render(
      <LightPage api="http://api" token={async () => "tok"} onOpenCollection={() => undefined} />,
    );
    expect(screen.queryByRole("button", { name: "Löschen" })).toBeNull();
    await userEvent.click(await screen.findByRole("button", { name: "Zone 2 ändern" }));
    await userEvent.click(screen.getByRole("button", { name: "Lichtzone löschen" }));
    await userEvent.click(screen.getByRole("button", { name: "Nicht löschen" }));
    expect(screen.getByRole("button", { name: "Lichtzone löschen" })).toBeTruthy();
  });

  it("assigns a light zone to a location without zone", async () => {
    const { calls } = fakeServer({ zones: [zone], locations: [location] });
    render(
      <LightPage api="http://api" token={async () => "tok"} onOpenCollection={() => undefined} />,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Balkon ändern" }));
    await userEvent.selectOptions(
      screen.getByLabelText("Lichtzone", { selector: "form[aria-label='Balkon ändern'] select" }),
      "z1",
    );
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(await screen.findByText("Zone 2 · außen")).toBeTruthy();
    expect(calls.find((a) => a.url === "/locations/s1")?.body).toEqual({
      name: "Balkon",
      lightZoneId: "z1",
      kind: "outdoor",
    });
  });
});

describe("US-QS-14 feedback on the light page", () => {
  it("US-QS-14 a saved location is confirmed with a toast", async () => {
    fakeServer({ zones: [zone], locations: [location] });
    render(
      <LightPage api="http://api" token={async () => "tok"} onOpenCollection={() => undefined} />,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Balkon ändern" }));
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(await screen.findByText("Standort gespeichert.")).toBeTruthy();
  });

  it("US-QS-14 a refused write shows no success toast", async () => {
    fakeServer({ zones: [], locations: [] });
    render(
      <LightPage api="http://api" token={async () => "tok"} onOpenCollection={() => undefined} />,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Standard-Zonen übernehmen" }));
    await screen.findByRole("alert");
    expect(screen.queryByText("Standard-Zonen übernommen.")).toBeNull();
  });

  it("US-QS-14 a location without light zone shows a banner that says what to do", async () => {
    fakeServer({ zones: [zone], locations: [location] });
    render(
      <LightPage api="http://api" token={async () => "tok"} onOpenCollection={() => undefined} />,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Hinweise (1)" }));
    expect(await screen.findByText("Lichtzone unbekannt")).toBeTruthy();
    expect(screen.getByText(/Für Balkon fehlt die Lichtzone/)).toBeTruthy();
  });
});

describe("US-LIC-01 determine the zone of a species on the page", () => {
  it("queries the derivation of the API and shows zone and reason", async () => {
    const { calls } = fakeServer({ zones: [zone] });
    render(
      <LightPage api="http://api" token={async () => "tok"} onOpenCollection={() => undefined} />,
    );
    await screen.findByRole("heading", { name: "Zone 2" });
    await userEvent.click(screen.getByRole("button", { name: REFERENCE }));
    await userEvent.type(screen.getByLabelText("Lux-Bedarf der Art (Lux)"), "15000");
    await userEvent.click(screen.getByRole("button", { name: "Zone ermitteln" }));
    expect(await screen.findByText("Lichtzone: Zone 2")).toBeTruthy();
    const get = calls.find((a) => a.url === "/light-zones/derivation");
    expect(get?.method).toBe("GET");
  });

  it("without sign-in while determining: error text instead of a call to the API", async () => {
    fakeServer({ zones: [zone] });
    let signedIn = true;
    const token = async () => (signedIn ? "tok" : undefined);
    render(<LightPage api="http://api" token={token} onOpenCollection={() => undefined} />);
    await screen.findByRole("heading", { name: "Zone 2" });
    await userEvent.click(screen.getByRole("button", { name: REFERENCE }));
    signedIn = false;
    await userEvent.type(screen.getByLabelText("Lux-Bedarf der Art (Lux)"), "15000");
    await userEvent.click(screen.getByRole("button", { name: "Zone ermitteln" }));
    expect((await screen.findAllByText(SIGNED_OUT)).length).toBeGreaterThan(0);
  });
});

describe("US-LIC-05 · DS-48 forms and refusals", () => {
  it("an invalid zone form sends nothing, focuses the first invalid field and links its German message", async () => {
    const { calls } = fakeServer();
    render(
      <LightPage api="http://api" token={async () => "tok"} onOpenCollection={() => undefined} />,
    );
    await screen.findByText("Noch keine Lichtzonen", { exact: false });
    await pressFirst("Neue Lichtzone");
    await userEvent.click(screen.getByRole("button", { name: "Zone anlegen" }));
    const name = screen.getByLabelText("Name", {
      selector: "form[aria-label='Lichtzone anlegen'] input",
    });
    expect(document.activeElement).toBe(name);
    expect(name.getAttribute("aria-invalid")).toBe("true");
    const message = await screen.findByText("Bitte gib einen Namen ein.");
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
    render(
      <LightPage api="http://api" token={async () => "tok"} onOpenCollection={() => undefined} />,
    );
    await screen.findByText("Noch keine Lichtzonen", { exact: false });
    await pressFirst("Neue Lichtzone");
    const name = screen.getByLabelText("Name", {
      selector: "form[aria-label='Lichtzone anlegen'] input",
    });
    await userEvent.type(name, "Zone 2");
    await userEvent.type(screen.getByLabelText("Lux-Decke (Lux)"), "8000");
    await userEvent.click(screen.getByRole("button", { name: "Zone anlegen" }));
    expect(await screen.findByText("Eine Lichtzone mit diesem Namen gibt es schon.")).toBeTruthy();
    expect(screen.queryByText(/raw server text/)).toBeNull();
    expect(document.activeElement).toBe(name);
    expect((name as HTMLInputElement).value).toBe("Zone 2");
  });

  it("no locations yet: the empty state offers to create the first one and moves the focus to its name", async () => {
    fakeServer({ zones: [zone] });
    render(
      <LightPage api="http://api" token={async () => "tok"} onOpenCollection={() => undefined} />,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Ersten Standort anlegen" }));
    expect(screen.getByRole("heading", { name: "Neuer Standort" })).toBeTruthy();
    expect(
      screen.getByLabelText("Name", { selector: "form[aria-label='Standort anlegen'] input" }),
    ).toBeTruthy();
  });
});

describe("US-QS-19 management on one screen", () => {
  const locationsSeven = Array.from({ length: 7 }, (_, i) => ({
    id: `s${i + 1}`,
    name: `Standort ${i + 1}`,
    lightZoneId: "z1",
    kind: "indoor" as const,
  }));

  it("US-QS-19 on a phone the zones and the locations are two segments with their counts; one list at a time", async () => {
    setViewportWidth(360);
    fakeServer({ zones: [zone], locations: [location] });
    render(
      <LightPage api="http://api" token={async () => "tok"} onOpenCollection={() => undefined} />,
    );
    await screen.findByRole("heading", { name: "Zone 2" });
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

  it("US-QS-19 a phone pages the locations with four compact rows a page and says which page it shows", async () => {
    setViewportWidth(360);
    fakeServer({ zones: [zone], locations: locationsSeven });
    render(
      <LightPage api="http://api" token={async () => "tok"} onOpenCollection={() => undefined} />,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Standorte (7)" }));
    const list = screen.getByRole("list", { name: "Standorte" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByRole("status").textContent).toContain("Seite 1 von 2");
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByRole("status").textContent).toContain("Seite 2 von 2");
  });

  it("US-QS-19 each row shows name, facts and one Ändern button, and its layer holds the form", async () => {
    fakeServer({ zones: [zone], locations: [location] });
    render(
      <LightPage api="http://api" token={async () => "tok"} onOpenCollection={() => undefined} />,
    );
    expect(await screen.findByRole("button", { name: "Zone 2 ändern" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Balkon ändern" })).toBeTruthy();
    expect(screen.getByText(/^bis 15\.000/)).toBeTruthy();
    expect(screen.getByText("Keine Lichtzone · außen")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Balkon ändern" }));
    expect(
      screen.getByLabelText("Name", { selector: "form[aria-label='Balkon ändern'] input" }),
    ).toBeTruthy();
  });
});
