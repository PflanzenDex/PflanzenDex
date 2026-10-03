import { describe, expect, it, vi } from "vitest";
import { createWrite, loadLight } from "./light-api";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

describe("US-LIC-05 client of the light API", () => {
  it("loads zones, locations and hints with bearer token", async () => {
    const fetchFn = vi.fn<typeof fetch>(async (url) => {
      const u = String(url);
      if (u.endsWith("/light-zones")) return response(200, { zones: [] });
      if (u.endsWith("/locations")) return response(200, { locations: [] });
      return response(200, { hints: [] });
    });
    const r = await loadLight("http://api", "tok", fetchFn as unknown as typeof fetch);
    expect(r).toEqual({ ok: true, value: { zones: [], locations: [], hints: [] } });
    const header = fetchFn.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(header["Authorization"]).toBe("Bearer tok");
  });

  it("writing sends a new Idempotency-Key per call", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => response(201, { id: "z" }));
    const write = createWrite("http://api", "tok", fetchFn as unknown as typeof fetch);
    await write("POST", "/light-zones", { name: "A" });
    await write("POST", "/light-zones", { name: "A" });
    const key = fetchFn.mock.calls.map(
      (a) =>
        ((a as unknown[])[1] as { headers: Record<string, string> }).headers["Idempotency-Key"],
    );
    expect(key[0]).toBeTruthy();
    expect(key[0]).not.toBe(key[1]);
  });

  it("passes on the server's error together with the users of the zone", async () => {
    const error = {
      code: "light_zone.in_use",
      text: "Genutzt",
      data: [{ kind: "location", id: "s", name: "Regal" }],
    };
    const write = createWrite("http://api", "t", (async () =>
      response(409, { error })) as unknown as typeof fetch);
    expect(await write("DELETE", "/light-zones/z")).toEqual({ ok: false, error });
  });

  it("an unreachable server is reported understandably, nothing is shown half-way", async () => {
    const fetchFn = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    const r = await loadLight("http://api", "t", fetchFn);
    expect(!r.ok && r.error.code).toBe("network.not_reachable");
  });
});
