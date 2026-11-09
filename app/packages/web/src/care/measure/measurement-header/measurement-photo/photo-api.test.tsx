// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newRepeatKey } from "@/shared/data";
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
    const r = await uploadPhoto({ api: API, token: "tok", fetchFn: answering(200) }, "s1", {
      file: FILE,
      replace: true,
    });
    expect(r.ok).toBe(true);
    await show();
    expect(loads).toBe(2);
  });

  it("NFR-12 a refused upload changes nothing, so the cached picture stays", async () => {
    await show();
    const r = await uploadPhoto({ api: API, token: "tok", fetchFn: answering(409) }, "s1", {
      file: FILE,
    });
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
  const photo = (bytes: number[]) =>
    new File([new Uint8Array(bytes)], "p.jpg", { type: "image/jpeg", lastModified: 1 });
  const lost = () => Promise.reject(new TypeError("Failed to fetch"));
  const saved = async () => new Response(JSON.stringify({ photo: "p.webp" }), { status: 201 });
  /** The upload of one user action: the key of the action is passed on (without one, the upload gets a key of its own). */
  const send = (fetchFn: typeof fetch, file: File, key?: string) =>
    uploadPhoto({ api: API, token: "tok", fetchFn }, "s1", { file, date: "2026-10-01" }, key);

  it("US-QS-03 a lost answer, then the repeat with the key of its action: the same Idempotency-Key", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(lost)
      .mockImplementationOnce(saved);
    const key = newRepeatKey();
    const first = await send(fetchFn, photo([1, 2, 3]), key);
    const second = await send(fetchFn, photo([1, 2, 3]), key);
    expect([first.ok, second.ok]).toEqual([false, true]);
    expect(sentKey(fetchFn, 0)).toBe(key);
    expect(sentKey(fetchFn, 1)).toBe(key);
  });

  it("US-QS-03 the same file sent again without the key of its action is a new write: no content comparison", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(lost)
      .mockImplementationOnce(saved);
    await send(fetchFn, photo([1, 2, 3]));
    await send(fetchFn, photo([1, 2, 3]));
    expect(sentKey(fetchFn, 1)).not.toBe(sentKey(fetchFn, 0));
  });

  it("US-QS-03 after a saved photo the same file is a new write again, so a genuine second photo gets the replace question", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(saved)
      .mockImplementationOnce(
        async () =>
          new Response(JSON.stringify({ error: { code: "measurement.photo_exists", text: "x" } }), {
            status: 409,
          }),
      );
    await send(fetchFn, photo([1, 2, 3]));
    const again = await send(fetchFn, photo([1, 2, 3]));
    expect(again).toMatchObject({ ok: false, error: { code: "measurement.photo_exists" } });
    expect(sentKey(fetchFn, 1)).not.toBe(sentKey(fetchFn, 0));
  });
});
