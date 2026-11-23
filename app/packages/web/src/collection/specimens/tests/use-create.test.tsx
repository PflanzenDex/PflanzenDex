// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { Species } from "@pflanzendex/core";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClient, forgetRepeatKeys, type ApiError } from "@/shared/data";
import type { CreateInput } from "../create/create-input";
import { useCreate } from "../create/use-create";

afterEach(() => {
  cleanup();
  forgetRepeatKeys();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/**
 * A server that keeps one record per Idempotency-Key, as the API does: a key that comes back with the same request gets
 * the stored answer, with another request `idempotency.key_conflict`. The first `lost` writes are applied and their answer
 * is lost on the way back (a network error for the client). The light zones are read on the way (GET), they are not writes.
 */
function createServer(lost: number) {
  const records = new Map<string, string>();
  const saved = new Map<string, unknown>();
  const keys: string[] = [];
  let left = lost;
  const plant = { id: "e1", name: "Monstera", status: "plant", locationId: "loc1" };
  const fetchFn = vi.fn<typeof fetch>(async (url, init) => {
    if (init?.method === undefined || init.method === "GET")
      return new Response(JSON.stringify({ zones: [] }), { status: 200 });
    const key = (init.headers as Record<string, string>)["Idempotency-Key"] ?? "";
    const request = `${init.method} ${String(url)} ${String(init.body ?? "")}`;
    keys.push(key);
    const seen = records.get(key);
    // A conflict carries the saved result of the first write under the key (US-QS-03, data.saved).
    if (seen !== undefined && seen !== request)
      return new Response(
        JSON.stringify({
          error: { code: "idempotency.key_conflict", text: "x", data: { saved: saved.get(key) } },
        }),
        { status: 409 },
      );
    if (seen === undefined) {
      records.set(key, request);
      saved.set(key, plant);
    }
    if (left > 0) {
      left -= 1;
      throw new TypeError("Failed to fetch");
    }
    return new Response(JSON.stringify(plant), { status: 201 });
  });
  return { fetchFn, keys, records };
}

const SPECIES = { id: "species-1" } as Species;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={createQueryClient()}>{children}</QueryClientProvider>
);

describe("US-QS-03 · a create keeps its key: a lost answer and an edited form give one specimen", () => {
  it("US-QS-03 a lost answer, an edited tap (idempotency.key_conflict) and another edited tap write one specimen; the original form replays its answer", async () => {
    const server = createServer(1);
    vi.stubGlobal("fetch", server.fetchFn);
    const after = vi.fn();
    const completed = vi.fn();
    const say = vi.fn();
    const { result } = renderHook(
      () => useCreate("http://api", async () => "tok", SPECIES, { after, completed, say }),
      { wrapper },
    );
    const original: CreateInput = { marker: "Fensterbank" };
    const edited: CreateInput = { marker: "Kühlschrank" };
    const answers: (ApiError | null)[] = [];
    const tap = (input: CreateInput) =>
      act(async () => {
        answers.push(await result.current.send(input));
      });

    await tap(original);
    expect(answers[0]?.code).toBe("network.not_reachable");
    await tap(edited);
    expect(answers[1]?.code).toBe("idempotency.key_conflict");
    await tap(edited);
    expect(answers[2]?.code).toBe("idempotency.key_conflict");
    await tap(original);
    expect(answers[3]).toBeNull();

    const creations = server.fetchFn.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(creations).toHaveLength(4);
    expect(new Set(server.keys).size).toBe(1);
    expect(server.records.size).toBe(1);
    expect(after).toHaveBeenCalledTimes(1);
    expect(completed).toHaveBeenCalledTimes(1);
    expect(say).toHaveBeenCalledTimes(1);
  });
});

describe("US-QS-03 · a key conflict of a create names the saved plant, and dismissing it frees the key", () => {
  it("US-QS-03 the conflict names the saved plant; dismissing it frees the key, so the next edited tap is a new specimen", async () => {
    const server = createServer(1);
    vi.stubGlobal("fetch", server.fetchFn);
    const after = vi.fn();
    const { result } = renderHook(
      () =>
        useCreate("http://api", async () => "tok", SPECIES, {
          after,
          completed: vi.fn(),
          say: vi.fn(),
        }),
      { wrapper },
    );
    const answers: (ApiError | null)[] = [];
    const tap = (input: CreateInput) =>
      act(async () => {
        answers.push(await result.current.send(input));
      });

    await tap({ marker: "Fensterbank" });
    expect(answers[0]?.code).toBe("network.not_reachable");
    await tap({ marker: "Kühlschrank" });
    expect(answers[1]).toMatchObject({
      code: "idempotency.key_conflict",
      conflictText: "Gesichert ist: Monstera. Deine Änderung ist noch nicht gesichert.",
    });
    act(() => result.current.dismissRefusal());
    await tap({ marker: "Kühlschrank" });
    expect(answers[2]).toBeNull();
    expect(server.records.size).toBe(2);
    expect(after).toHaveBeenCalledTimes(1);
  });
});
