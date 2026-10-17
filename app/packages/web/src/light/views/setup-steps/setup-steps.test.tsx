// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocationsStep, ZonesStep } from "./setup-steps";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";
const ZONE = { id: "z1", name: "Lampe 2", luxCeiling: 15000, ppfd: null, sortOrder: 2 };

interface World {
  zoneWrites?: { method: string; path: string; body: Record<string, unknown> }[];
  zones: unknown[];
  locations: { id: string; name: string; lightZoneId: string | null; kind: string }[];
}

type Handler = (body: Record<string, unknown>) => Promise<Response>;

function routes(w: World): Record<string, Handler> {
  return {
    "GET /light-zones": () => response(200, { zones: w.zones }),
    "GET /locations": () => response(200, { locations: w.locations }),
    "GET /hints": () => response(200, { hints: [] }),
    "POST /locations": (body) => {
      if (body["name"] === "Doppelt")
        return response(409, {
          error: { code: "location.name_taken", text: "raw server text" },
        });
      w.locations.push({
        id: "s1",
        name: String(body["name"] ?? ""),
        lightZoneId: null,
        kind: "indoor",
      });
      return response(201, w.locations[0]);
    },
    "POST /light-zones/defaults": () => {
      w.zones = [ZONE];
      return response(201, { zones: w.zones });
    },
    "PUT /light-zones/z1": (body) => {
      w.zoneWrites?.push({ method: "PUT", path: "/light-zones/z1", body });
      return response(200, { ...ZONE, ...body });
    },
    "POST /light-zones": (body) => {
      w.zoneWrites?.push({ method: "POST", path: "/light-zones", body });
      return response(201, { ...ZONE, id: "z9", ...body });
    },
    "PUT /locations/s1": () => {
      const loc = w.locations[0];
      if (loc) loc.lightZoneId = "z1";
      return response(200, loc);
    },
  };
}

function fakeServer(w: World) {
  const table = routes(w);
  const fetchFn = vi.fn<typeof fetch>(async (url, init) => {
    const handler = table[`${init?.method ?? "GET"} ${new URL(String(url)).pathname}`];
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, string>) : {};
    return handler ? handler(body) : response(404, {});
  });
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-ACC-03 onboarding steps: locations and light zones", () => {
  it("US-ACC-03 locations step: adds a location and skipping without one is offered", async () => {
    const world: World = { zones: [], locations: [] };
    fakeServer(world);
    const onNext = vi.fn();
    render(<LocationsStep api="http://api" token={token} onNext={onNext} />);
    expect(await screen.findByRole("heading", { name: "Wo stehen deine Pflanzen?" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Überspringen" })).toBeTruthy();
    await userEvent.type(await screen.findByLabelText("Name"), "Fensterbank");
    await userEvent.click(screen.getByRole("button", { name: "Standort anlegen" }));
    expect(await screen.findByText("Fensterbank")).toBeTruthy();
    expect(world.locations).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("US-ACC-03 locations step: a refusal stays visible and the step stays usable", async () => {
    fakeServer({ zones: [], locations: [] });
    const onNext = vi.fn();
    render(<LocationsStep api="http://api" token={token} onNext={onNext} />);
    await userEvent.type(await screen.findByLabelText("Name"), "Doppelt");
    await userEvent.click(screen.getByRole("button", { name: "Standort anlegen" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Einen Standort mit diesem Namen gibt es schon.");
    expect(alert.textContent).not.toContain("raw server text");
    await userEvent.click(screen.getByRole("button", { name: "Überspringen" }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("US-ACC-03 zones step: takes over the default levels and lets the user assign a zone to a location", async () => {
    const world: World = {
      zones: [],
      locations: [{ id: "s1", name: "Kiste", lightZoneId: null, kind: "indoor" }],
    };
    fakeServer(world);
    const onNext = vi.fn();
    render(<ZonesStep api="http://api" token={token} onNext={onNext} />);
    expect(await screen.findByRole("heading", { name: "Wie hell ist es?" })).toBeTruthy();
    await userEvent.click(
      await screen.findByRole("button", { name: "Standard-Lampen übernehmen" }),
    );
    expect(await screen.findByText(/Lampe 2/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Lichtzone zuweisen" }));
    await userEvent.selectOptions(screen.getByLabelText("Lichtzone"), "z1");
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(world.locations[0]?.lightZoneId).toBe("z1"));
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("US-ACC-03 zones step: the default levels can be adjusted right here", async () => {
    const world: World = { zones: [ZONE], locations: [], zoneWrites: [] };
    fakeServer(world);
    render(<ZonesStep api="http://api" token={token} onNext={() => undefined} />);
    const list = await screen.findByRole("list", { name: "Lichtzonen" });
    await userEvent.click(within(list).getByRole("button", { name: "Ändern" }));
    const lux = within(screen.getByRole("form", { name: "Lampe 2 ändern" })).getByLabelText(
      "Lux-Decke (Lux)",
    );
    await userEvent.clear(lux);
    await userEvent.type(lux, "20000");
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(world.zoneWrites).toHaveLength(1));
    expect(world.zoneWrites?.[0]).toMatchObject({
      method: "PUT",
      path: "/light-zones/z1",
      body: { luxCeiling: 20000 },
    });
  });

  it("US-ACC-03 zones step: an own zone can be added next to the defaults", async () => {
    const world: World = { zones: [ZONE], locations: [], zoneWrites: [] };
    fakeServer(world);
    render(<ZonesStep api="http://api" token={token} onNext={() => undefined} />);
    await userEvent.click(await screen.findByText("Neue Lichtzone"));
    await userEvent.type(screen.getByLabelText("Name"), "Balkonlampe");
    await userEvent.type(screen.getByLabelText("Lux-Decke (Lux)"), "30000");
    await userEvent.click(screen.getByRole("button", { name: "Zone anlegen" }));
    await waitFor(() => expect(world.zoneWrites).toHaveLength(1));
    expect(world.zoneWrites?.[0]?.body).toMatchObject({ name: "Balkonlampe", luxCeiling: 30000 });
  });

  it("US-ACC-03 zones step: can be skipped, the zones stay empty", async () => {
    const world: World = { zones: [], locations: [] };
    fakeServer(world);
    const onNext = vi.fn();
    render(<ZonesStep api="http://api" token={token} onNext={onNext} />);
    await userEvent.click(await screen.findByRole("button", { name: "Überspringen" }));
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(world.zones).toEqual([]);
  });

  it("US-ACC-03 a load error is shown with a retry, not a blank step", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        response(500, { error: { code: "server.error", text: "Der Server antwortet nicht." } }),
      ),
    );
    render(<LocationsStep api="http://api" token={token} onNext={() => undefined} />);
    expect((await screen.findByRole("alert")).textContent).toContain("Der Server antwortet nicht.");
    expect(screen.getByRole("button", { name: "Überspringen" })).toBeTruthy();
  });
});
