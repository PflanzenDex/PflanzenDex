// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCaughtSpeciesIds } from "./caught-species-ids";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const reply = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";

/** The server of the ownership: `caught` are the species ids the account has caught (US-POK-06). */
function fakeServer(answer: () => Promise<Response>) {
  const fetchFn = vi.fn<typeof fetch>(async (url) => {
    expect(new URL(String(url)).pathname).toBe("/pokedex/ownership");
    return answer();
  });
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}
const owned = (...ids: string[]) =>
  reply(200, {
    ownership: { caught: ids.map((speciesId) => ({ species: `Art ${speciesId}`, speciesId })) },
  });

describe("US-QS-15 · US-QS-21 the ids of the caught species for the quick filter of the catalog (issue 2587, d-166)", () => {
  it("US-QS-15 · US-QS-21 is loading with no caught set while the ownership loads: nothing is known yet, so nothing is guessed (P-08)", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((done) => {
      release = done;
    });
    fakeServer(async () => {
      await gate;
      return owned("a1");
    });
    const { result } = renderHook(() => useCaughtSpeciesIds("http://api", token));
    expect(result.current).toEqual({ caught: null, loading: true });
    release();
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("US-QS-15 · US-QS-21 holds the species id of every caught species once the ownership is there, and is no longer loading", async () => {
    fakeServer(() => owned("a1", "b2"));
    const { result } = renderHook(() => useCaughtSpeciesIds("http://api", token));
    await waitFor(() => expect(result.current.caught).not.toBeNull());
    expect([...(result.current.caught ?? [])].sort()).toEqual(["a1", "b2"]);
    expect(result.current.loading).toBe(false);
  });

  it("US-QS-15 · US-QS-21 is an empty set, not null, for an account that caught nothing", async () => {
    fakeServer(() => owned());
    const { result } = renderHook(() => useCaughtSpeciesIds("http://api", token));
    await waitFor(() => expect(result.current.caught).not.toBeNull());
    expect(result.current.caught?.size).toBe(0);
    expect(result.current.loading).toBe(false);
  });

  it("US-QS-15 · US-QS-21 has no caught set and is not loading when the ownership cannot be loaded, so the reason shows (P-10: no filter on a guess)", async () => {
    const fetchFn = fakeServer(() => reply(500, { error: { code: "system.unexpected" } }));
    const { result } = renderHook(() => useCaughtSpeciesIds("http://api", token));
    await waitFor(() => expect(fetchFn).toHaveBeenCalled());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.caught).toBeNull();
  });

  it("US-QS-15 · US-QS-21 keeps the same value while the ownership is unchanged, so a list does not filter again for nothing", async () => {
    fakeServer(() => owned("a1"));
    const { result, rerender } = renderHook(() => useCaughtSpeciesIds("http://api", token));
    await waitFor(() => expect(result.current.caught).not.toBeNull());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("US-QS-15 · US-QS-21 keeps the same value while the ownership still loads", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((done) => {
      release = done;
    });
    fakeServer(async () => {
      await gate;
      return owned("a1");
    });
    const { result, rerender } = renderHook(() => useCaughtSpeciesIds("http://api", token));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
    release();
    await waitFor(() => expect(result.current.loading).toBe(false));
  });
});
