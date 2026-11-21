// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStoredPhoto } from "@/shared/platform/browser/use-stored-photo";
import { uploadPhoto } from "./photo-api";

const API = "http://api";
const PHOTO = "/specimens/s1/measurements/m1/photo";
const FILE = new File([new Uint8Array([1])], "p.jpg", { type: "image/jpeg" });
const access = { api: API, token: async () => "tok" };

let loads: number;
const show = async () => {
  const view = renderHook(() => useStoredPhoto(access, PHOTO));
  await waitFor(() => expect(view.result.current).not.toBeNull());
  view.unmount();
};
const answering = (status: number) =>
  vi.fn<typeof fetch>(async () => new Response(JSON.stringify({}), { status }));

beforeEach(() => {
  loads = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () => {
      loads += 1;
      return {
        ok: true,
        status: 200,
        blob: async () => ({ size: 1, type: "image/webp" }),
      } as unknown as Response;
    }),
  );
  URL.createObjectURL = vi.fn(() => "blob:1");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("uploadPhoto and the photo cache (NFR-12, US-WAC-06)", () => {
  it("NFR-12 after a photo is replaced the next view loads it again instead of showing the old one", async () => {
    await show();
    await show();
    expect(loads).toBe(1);
    const r = await uploadPhoto(
      { api: API, token: "tok", fetchFn: answering(200) },
      "s1",
      {
        file: FILE,
        replace: true,
      },
      "test-key",
    );
    expect(r.ok).toBe(true);
    await show();
    expect(loads).toBe(2);
  });

  it("NFR-12 a refused upload changes nothing, so the cached picture stays", async () => {
    await show();
    const r = await uploadPhoto(
      { api: API, token: "tok", fetchFn: answering(409) },
      "s1",
      {
        file: FILE,
      },
      "test-key",
    );
    expect(r.ok).toBe(false);
    await show();
    expect(loads).toBe(1);
  });
});

describe("US-QS-03 a repeated upload is the same write (repeat guard)", () => {
  const sentKey = (fetchFn: ReturnType<typeof vi.fn<typeof fetch>>, n: number) =>
    (fetchFn.mock.calls[n]?.[1]?.headers as Record<string, string> | undefined)?.[
      "Idempotency-Key"
    ];
  // The key is the caller's: the upload sends the key of its action (US-QS-03). Same name, size, type and time here.
  const photo = (bytes: number[]) =>
    new File([new Uint8Array(bytes)], "p.jpg", { type: "image/jpeg", lastModified: 1 });
  const lost = () => Promise.reject(new TypeError("Failed to fetch"));
  const saved = async () => new Response(JSON.stringify({ photo: "p.webp" }), { status: 201 });
  const send = (fetchFn: typeof fetch, file: File, key: string) =>
    uploadPhoto({ api: API, token: "tok", fetchFn }, "s1", { file, date: "2026-10-01" }, key);

  it("US-QS-03 a lost answer, then the same file again with the same key: the repeat carries that key", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(lost)
      .mockImplementationOnce(saved);
    const first = await send(fetchFn, photo([1, 2, 3]), "action-1");
    const second = await send(fetchFn, photo([1, 2, 3]), "action-1");
    expect([first.ok, second.ok]).toEqual([false, true]);
    expect(sentKey(fetchFn, 1)).toBe(sentKey(fetchFn, 0));
  });

  it("US-QS-03 another action after a lost answer is a new write: its key differs although the file is the same", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(lost)
      .mockImplementationOnce(saved);
    await send(fetchFn, photo([1, 2, 3]), "action-1");
    await send(fetchFn, photo([1, 2, 3]), "action-2");
    expect(sentKey(fetchFn, 1)).not.toBe(sentKey(fetchFn, 0));
  });

  it("US-QS-03 a changed file under the same key is refused by the server, it is not a new write", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(lost)
      .mockImplementationOnce(saved);
    await send(fetchFn, photo([1, 2, 3]), "action-1");
    await send(fetchFn, photo([9, 8, 7]), "action-1");
    expect(sentKey(fetchFn, 1)).toBe(sentKey(fetchFn, 0));
  });
});
