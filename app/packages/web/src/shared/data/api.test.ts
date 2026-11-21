// US-QS-30 · issue 1863: a write that cannot reach the server while the device is offline says so, by its code, and
// tells the keeper that the input stays; the server is not blamed for a missing network (SG-COPY-06, P-10).
import { afterEach, describe, expect, it, vi } from "vitest";
import { call, createWrite } from "./api";

const unreachable = (() => Promise.reject(new TypeError("Failed to fetch"))) as typeof fetch;
const offline = () => vi.stubGlobal("navigator", { onLine: false });

afterEach(() => vi.unstubAllGlobals());

describe("US-QS-30 a failed request without a network (issue 1863)", () => {
  it("US-QS-30 an offline write says that the connection is missing and the input stays", async () => {
    offline();
    const r = await call(unreachable, "http://api/x", "t", { method: "POST", body: {} });
    expect(r).toEqual({
      ok: false,
      error: {
        code: "network.not_reachable",
        text: "Keine Verbindung. Deine Eingabe bleibt hier stehen.",
      },
    });
  });

  it("US-QS-30 an online write that gets no answer still says that the server is not reachable", async () => {
    const r = await call(unreachable, "http://api/x", "t", { method: "PUT", body: {} });
    expect(r.ok ? null : r.error.text).toBe(
      "Der Server ist gerade nicht erreichbar. Bitte versuche es gleich noch einmal.",
    );
  });
});

describe("US-QS-30 a write that is not buffered is refused before it is sent offline (issue 1863, P-10)", () => {
  it("US-QS-30 offline createWrite does not call fetch and says the connection is missing, whatever sent it", async () => {
    offline();
    const fetchSpy = vi.fn<typeof fetch>(() => Promise.reject(new TypeError("Failed to fetch")));
    const r = await createWrite("http://api", "t", { key: "k", fetchFn: fetchSpy })(
      "POST",
      "/treatments",
      {},
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(r).toEqual({
      ok: false,
      error: {
        code: "network.not_reachable",
        text: "Keine Verbindung. Deine Eingabe bleibt hier stehen.",
      },
    });
  });

  it("US-QS-30 online the same createWrite is sent with its repeat-guard key", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    const fetchSpy = vi.fn<typeof fetch>(async () => new Response("{}", { status: 200 }));
    const r = await createWrite("http://api", "t", { key: "k", fetchFn: fetchSpy })(
      "POST",
      "/treatments",
      {},
    );
    expect(r.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("US-QS-03 the key of the write options is sent on every send (no content comparison)", () => {
  it("US-QS-03 two sends with the same options carry the same Idempotency-Key, whatever their body", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    const fetchSpy = vi.fn<typeof fetch>(async () => new Response("{}", { status: 200 }));
    const write = createWrite("http://api", "t", { key: "action-key", fetchFn: fetchSpy });
    await write("POST", "/treatments", { a: 1 });
    await write("POST", "/treatments", { a: 2 });
    const keys = fetchSpy.mock.calls.map(
      ([, init]) => (init?.headers as Record<string, string>)["Idempotency-Key"],
    );
    expect(keys).toEqual(["action-key", "action-key"]);
  });

  it("US-QS-03 an offline write with a buffer is handed to it as plain data, not sent", async () => {
    offline();
    const fetchSpy = vi.fn<typeof fetch>();
    const buffer = vi.fn(async () => ({ ok: true as const, value: {} }));
    await createWrite("http://api", "t", { key: "k", fetchFn: fetchSpy, buffer })("PUT", "/x", {
      v: 1,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(buffer).toHaveBeenCalledWith({
      method: "PUT",
      url: "http://api/x",
      body: { v: 1 },
      key: "k",
    });
  });
});
