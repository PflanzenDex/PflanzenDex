// US-QS-30 · issue 1863: a write that cannot reach the server while the device is offline says so, by its code, and
// tells the keeper that the input stays; the server is not blamed for a missing network (SG-COPY-06, P-10).
import { afterEach, describe, expect, it, vi } from "vitest";
import { call } from "./api";

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
