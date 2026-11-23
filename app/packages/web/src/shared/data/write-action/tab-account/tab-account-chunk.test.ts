// @vitest-environment jsdom
// US-QS-07 · a write whose account check cannot load is refused, never sent unchecked (P-04, P-10). The check is its own
// chunk; this file loads the API on a fresh module graph in which that chunk fails.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.doMock("./tab-account", () => {
    throw new Error("chunk failed to load");
  });
});

afterEach(() => {
  vi.doUnmock("./tab-account");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("US-QS-07 · a failed load of the account check refuses the write (P-04, P-10)", () => {
  it("US-QS-07 the check cannot load: the write is refused with system.unexpected and nothing is sent", async () => {
    const api = await import("../../api");
    api.tabAccount.sub = "A";
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
    const fetchFn = vi.fn<typeof fetch>(async () => new Response("{}", { status: 201 }));
    const r = await api.createWrite("http://api", "token-of-B", { key: "k", fetchFn })(
      "POST",
      "/measurements",
      { value: 9 },
    );
    expect(fetchFn).not.toHaveBeenCalled();
    expect(r).toEqual({
      ok: false,
      error: {
        code: "system.unexpected",
        text: "Das hat nicht geklappt. Bitte versuche es noch einmal.",
      },
    });
  });
});
