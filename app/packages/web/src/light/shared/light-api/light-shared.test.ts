import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../../shared/data";
import { refreshLight, sharedLocations, sharedZones } from "./light-shared";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const LOCATION = { id: "l1", name: "Fenster Süd", lightZoneId: null, kind: "indoor" };
const ZONE = { id: "z1", name: "Stecklingslicht", luxCeiling: 5000, ppfd: null, sortOrder: 1 };

/** The API of the light data, counting what is asked: the answer per path. */
function server() {
  return vi.fn<typeof fetch>(async (url) => {
    const path = new URL(String(url)).pathname;
    if (path === "/locations") return json(200, { locations: [LOCATION] });
    if (path === "/light-zones") return json(200, { zones: [ZONE] });
    return json(404, {});
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("NFR-12 one copy of the light data for every screen that shows it", () => {
  it("NFR-12 the locations are asked once while the copy is fresh, whichever screen reads them", async () => {
    const fetchFn = server();
    vi.stubGlobal("fetch", fetchFn);
    const client = createQueryClient();
    expect(await sharedLocations(client, "http://api", "tok")).toEqual({
      ok: true,
      value: [LOCATION],
    });
    expect(await sharedLocations(client, "http://api", "tok")).toEqual({
      ok: true,
      value: [LOCATION],
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("NFR-12 a write of the light data refreshes the copies, so the next read asks again", async () => {
    const fetchFn = server();
    vi.stubGlobal("fetch", fetchFn);
    const client = createQueryClient();
    await sharedLocations(client, "http://api", "tok");
    await sharedZones(client, "http://api", "tok");
    await refreshLight(client);
    expect(await sharedLocations(client, "http://api", "tok")).toEqual({
      ok: true,
      value: [LOCATION],
    });
    expect(await sharedZones(client, "http://api", "tok")).toEqual({ ok: true, value: [ZONE] });
    // one request per endpoint before the write, one per endpoint after it
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it("NFR-12 zones and locations are separate copies, and a failed read is not kept as a copy", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      json(500, { error: { code: "server.error", text: "Der Server antwortet nicht." } }),
    );
    vi.stubGlobal("fetch", fetchFn);
    const client = createQueryClient();
    const failed = await sharedLocations(client, "http://api", "tok");
    expect(failed).toEqual({
      ok: false,
      error: { code: "server.error", text: "Der Server antwortet nicht." },
    });
    await sharedLocations(client, "http://api", "tok");
    expect(fetchFn).toHaveBeenCalledTimes(2);
    await sharedZones(client, "http://api", "tok");
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });
});
