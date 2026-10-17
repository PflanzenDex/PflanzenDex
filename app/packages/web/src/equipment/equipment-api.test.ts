import { describe, expect, it, vi } from "vitest";
import { loadEquipment } from "./equipment-api";

const answer = (path: string) => {
  if (path === "/equipment/sharing") return { shared: [{ equipmentId: "e1", note: null }] };
  if (path === "/equipment") return { equipment: [] };
  return {
    zones: [],
    lamps: [],
    sensors: [],
    needs: [],
    wishes: [],
    recommendations: [],
    devices: [],
    unassigned: [],
  };
};

describe("US-DEV-06 equipment without the social function", () => {
  it("US-DEV-06 does not ask for the sharing settings while social is off, and keeps loading", async () => {
    const fetchFn = vi.fn<typeof fetch>(
      async (url) =>
        new Response(JSON.stringify(answer(new URL(String(url)).pathname)), { status: 200 }),
    );
    const r = await loadEquipment("http://api", "tok", fetchFn, { sharing: false });
    expect(r.ok).toBe(true);
    const asked = fetchFn.mock.calls.map(([u]) => new URL(String(u)).pathname);
    expect(asked).not.toContain("/equipment/sharing");
    if (r.ok) expect(r.value.sharing).toEqual([]);
  });

  it("US-DEV-06 asks for the sharing settings by default", async () => {
    const fetchFn = vi.fn<typeof fetch>(
      async (url) =>
        new Response(JSON.stringify(answer(new URL(String(url)).pathname)), { status: 200 }),
    );
    await loadEquipment("http://api", "tok", fetchFn);
    expect(fetchFn.mock.calls.map(([u]) => new URL(String(u)).pathname)).toContain(
      "/equipment/sharing",
    );
  });

  it("US-EQU-10 does not ask for recommendations while the switch is off", async () => {
    const fetchFn = vi.fn<typeof fetch>(
      async (url) =>
        new Response(JSON.stringify(answer(new URL(String(url)).pathname)), { status: 200 }),
    );
    const r = await loadEquipment("http://api", "tok", fetchFn, { recommendations: false });
    expect(r.ok).toBe(true);
    expect(fetchFn.mock.calls.map(([u]) => new URL(String(u)).pathname)).not.toContain(
      "/equipment/recommendations",
    );
    if (r.ok) expect(r.value.recommendations).toEqual([]);
  });
});
