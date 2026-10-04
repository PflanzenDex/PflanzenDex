// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LightPage } from "./LightPage";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const zone = { id: "z1", name: "Lampe 2", luxCeiling: 15000, ppfd: 300, sortOrder: 2 };
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
      error: { code: "light_zone.default_not_empty", text: "Es gibt schon Zonen." },
    }),
  "PUT /light-zones/z1": async (d, body) => {
    d.zones[0] = { ...zone, ...(body as object) };
    return response(200, {});
  },
  "DELETE /light-zones/z1": () =>
    response(409, {
      error: {
        code: "light_zone.in_use",
        text: "Die Zone wird noch benutzt.",
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
  "GET /hints": () => response(200, { hints: [] }),
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

describe("US-LIC-05 page locations and light zones", () => {
  it("shows a status while loading and then zone and location from the API", async () => {
    fakeServer({ zones: [zone], locations: [location] });
    render(<LightPage api="http://api" token={async () => "tok"} />);
    expect(screen.getByRole("status").textContent).toContain("werden geladen");
    expect(await screen.findByRole("heading", { name: "Lampe 2" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Balkon" })).toBeTruthy();
  });

  it('without sign-in: error text with action "Erneut versuchen", no call to the API (P-09)', async () => {
    const { fetchFn } = fakeServer();
    const token = vi.fn<() => Promise<string | undefined>>(async () => undefined);
    render(<LightPage api="http://api" token={token} />);
    expect((await screen.findByRole("alert")).textContent).toContain("Bitte melde dich neu an.");
    expect(fetchFn).not.toHaveBeenCalled();
    token.mockResolvedValue("tok");
    fakeServer({ zones: [zone] });
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(await screen.findByRole("heading", { name: "Lampe 2" })).toBeTruthy();
  });

  it("a server error while loading is shown with its text, nothing is shown half", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        response(500, { error: { code: "server.error", text: "Das hat nicht geklappt." } }),
      ),
    );
    render(<LightPage api="http://api" token={async () => "tok"} />);
    expect((await screen.findByRole("alert")).textContent).toContain("Das hat nicht geklappt.");
  });

  it("creates a zone: sends with Idempotency-Key and reloads afterwards", async () => {
    const { calls } = fakeServer();
    render(<LightPage api="http://api" token={async () => "tok"} />);
    await screen.findByText("Noch keine Lichtzonen", { exact: false });
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
    render(<LightPage api="http://api" token={async () => "tok"} />);
    await screen.findByRole("heading", { name: "Lampe 2" });
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
    render(<LightPage api="http://api" token={async () => "tok"} />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Standard-Lampen übernehmen" }),
    );
    expect((await screen.findAllByText("Es gibt schon Zonen.")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Standard-Lampen übernehmen" })).toBeTruthy();
  });

  it("changes a zone: the form shows the old values, after saving the new name is there", async () => {
    const { calls } = fakeServer({ zones: [zone] });
    render(<LightPage api="http://api" token={async () => "tok"} />);
    await userEvent.click(await screen.findByRole("button", { name: "Ändern" }));
    const name = screen.getByLabelText("Name", {
      selector: "form[aria-label='Lampe 2 ändern'] input",
    });
    expect((name as HTMLInputElement).value).toBe("Lampe 2");
    await userEvent.clear(name);
    await userEvent.type(name, "Lampe 3");
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(await screen.findByRole("heading", { name: "Lampe 3" })).toBeTruthy();
    const put = calls.find((a) => a.method === "PUT");
    expect(put?.body).toMatchObject({ name: "Lampe 3", luxCeiling: 15000, ppfd: 300 });
  });

  it("cancel while changing discards the input without a write call", async () => {
    const { calls } = fakeServer({ zones: [zone] });
    render(<LightPage api="http://api" token={async () => "tok"} />);
    await userEvent.click(await screen.findByRole("button", { name: "Ändern" }));
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.getByRole("heading", { name: "Lampe 2" })).toBeTruthy();
    expect(calls.every((a) => a.method === "GET")).toBe(true);
  });

  it("deleting asks; a used zone stays with the error text of the API", async () => {
    const { calls } = fakeServer({ zones: [zone] });
    render(<LightPage api="http://api" token={async () => "tok"} />);
    await userEvent.click(await screen.findByRole("button", { name: "Löschen" }));
    expect(calls.some((a) => a.method === "DELETE")).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Ja, „Lampe 2“ löschen" }));
    expect((await screen.findAllByText("Die Zone wird noch benutzt.")).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Lampe 2" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Löschen" })).toBeTruthy();
  });

  it("deleting can be cancelled", async () => {
    fakeServer({ zones: [zone] });
    render(<LightPage api="http://api" token={async () => "tok"} />);
    await userEvent.click(await screen.findByRole("button", { name: "Löschen" }));
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.getByRole("button", { name: "Löschen" })).toBeTruthy();
  });

  it("assigns a light zone to a location without zone", async () => {
    const { calls } = fakeServer({ zones: [zone], locations: [location] });
    render(<LightPage api="http://api" token={async () => "tok"} />);
    await userEvent.click(await screen.findByRole("button", { name: "Lichtzone zuweisen" }));
    await userEvent.selectOptions(
      screen.getByLabelText("Lichtzone", { selector: "form[aria-label='Balkon ändern'] select" }),
      "z1",
    );
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(await screen.findByText("Lampe 2 · außen")).toBeTruthy();
    expect(calls.find((a) => a.url === "/locations/s1")?.body).toEqual({
      name: "Balkon",
      lightZoneId: "z1",
      kind: "outdoor",
    });
  });
});

describe("US-LIC-01 determine the zone of a species on the page", () => {
  it("queries the derivation of the API and shows zone and reason", async () => {
    const { calls } = fakeServer({ zones: [zone] });
    render(<LightPage api="http://api" token={async () => "tok"} />);
    await screen.findByRole("heading", { name: "Lampe 2" });
    await userEvent.type(screen.getByLabelText("Lux-Bedarf der Art (Lux)"), "15000");
    await userEvent.click(screen.getByRole("button", { name: "Zone ermitteln" }));
    expect(await screen.findByText("Lichtzone: Lampe 2")).toBeTruthy();
    const get = calls.find((a) => a.url === "/light-zones/derivation");
    expect(get?.method).toBe("GET");
  });

  it("without sign-in while determining: error text instead of a call to the API", async () => {
    fakeServer({ zones: [zone] });
    let signedIn = true;
    const token = async () => (signedIn ? "tok" : undefined);
    render(<LightPage api="http://api" token={token} />);
    await screen.findByRole("heading", { name: "Lampe 2" });
    signedIn = false;
    await userEvent.type(screen.getByLabelText("Lux-Bedarf der Art (Lux)"), "15000");
    await userEvent.click(screen.getByRole("button", { name: "Zone ermitteln" }));
    expect((await screen.findAllByText("Bitte melde dich neu an.")).length).toBeGreaterThan(0);
  });
});
