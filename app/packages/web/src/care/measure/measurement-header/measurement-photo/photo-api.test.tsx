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
