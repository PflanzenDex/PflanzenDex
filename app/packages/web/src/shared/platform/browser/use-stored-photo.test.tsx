// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPhotoCache,
  forgetPhotos,
  useStoredPhoto,
  type PhotoAccess,
} from "./use-stored-photo";

const access: PhotoAccess = { api: "http://api", token: async () => "tok" };
const MB = 1024 * 1024;

let fetched: string[];
let created: number;
let revoked: string[];

/** A picture of `size` bytes; the bytes themselves do not matter here, only their count (the cache bound). */
const picture = (size = 10) => ({ size, type: "image/webp" }) as unknown as Blob;

beforeEach(() => {
  fetched = [];
  created = 0;
  revoked = [];
  // Responses come with the blob attached, so the size of each picture can be chosen per test.
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url) => {
      fetched.push(String(url));
      return { ok: true, status: 200, blob: async () => picture() } as unknown as Response;
    }),
  );
  URL.createObjectURL = vi.fn(() => `blob:${++created}`);
  URL.revokeObjectURL = vi.fn((url: string) => {
    revoked.push(url);
  });
});

afterEach(() => {
  cleanup();
  clearPhotoCache();
  vi.unstubAllGlobals();
});

const path = (n: number) => `/specimens/s1/measurements/m${n}/photo`;

describe("NFR-12 the photo request in the size asked", () => {
  it("NFR-12 asks the thumbnail with size=thumb and the stored copy without it", async () => {
    const small = renderHook(() => useStoredPhoto(access, path(1), { size: "thumb" }));
    await waitFor(() => expect(typeof small.result.current).toBe("string"));
    const full = renderHook(() => useStoredPhoto(access, path(2)));
    await waitFor(() => expect(typeof full.result.current).toBe("string"));
    expect(fetched).toEqual([
      "http://api/specimens/s1/measurements/m1/photo?size=thumb",
      "http://api/specimens/s1/measurements/m2/photo",
    ]);
  });

  it("NFR-12 sends nothing while the picture is held back, and loads when it is let in", async () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useStoredPhoto(access, path(3), { size: "thumb", enabled }),
      { initialProps: { enabled: false } },
    );
    await act(async () => undefined);
    expect(fetched).toEqual([]);
    expect(result.current).toBeNull();
    rerender({ enabled: true });
    await waitFor(() => expect(typeof result.current).toBe("string"));
    expect(fetched).toEqual(["http://api/specimens/s1/measurements/m3/photo?size=thumb"]);
  });

  it("NFR-12 a picture that is cached by its request is fetched once, not again on every mount", async () => {
    const first = renderHook(() => useStoredPhoto(access, path(4), { size: "thumb" }));
    await waitFor(() => expect(typeof first.result.current).toBe("string"));
    const url = first.result.current;
    first.unmount();
    const again = renderHook(() => useStoredPhoto(access, path(4), { size: "thumb" }));
    await waitFor(() => expect(again.result.current).toBe(url));
    expect(fetched).toHaveLength(1);
  });

  it("NFR-12 the thumbnail and the stored copy are cached apart, since they are different requests", async () => {
    const small = renderHook(() => useStoredPhoto(access, path(5), { size: "thumb" }));
    await waitFor(() => expect(typeof small.result.current).toBe("string"));
    const full = renderHook(() => useStoredPhoto(access, path(5)));
    await waitFor(() => expect(typeof full.result.current).toBe("string"));
    expect(fetched).toHaveLength(2);
    expect(small.result.current).not.toBe(full.result.current);
  });

  it("NFR-12 forgetting the pictures of one specimen fetches them again on the next mount; other specimens stay cached", async () => {
    const mine = "/specimens/s1/measurements/m1/photo";
    const other = "/specimens/s2/measurements/m2/photo";
    const show = async (path: string, size?: "thumb") => {
      const view = renderHook(() => useStoredPhoto(access, path, size ? { size } : {}));
      await waitFor(() => expect(view.result.current).not.toBeNull());
      view.unmount();
    };
    await show(mine);
    await show(mine, "thumb");
    await show(other);
    expect(fetched).toHaveLength(3);
    forgetPhotos(access.api, "/specimens/s1/");
    await show(mine);
    await show(mine, "thumb");
    await show(other);
    expect(fetched).toEqual([
      `http://api${mine}`,
      `http://api${mine}?size=thumb`,
      `http://api${other}`,
      `http://api${mine}`,
      `http://api${mine}?size=thumb`,
    ]);
  });

  it("NFR-12 US-WAC-06 a versioned address keeps its query and takes the size after it", async () => {
    const versioned = renderHook(() =>
      useStoredPhoto(access, `${path(7)}?v=abc`, { size: "thumb" }),
    );
    await waitFor(() => expect(typeof versioned.result.current).toBe("string"));
    expect(fetched).toEqual(["http://api/specimens/s1/measurements/m7/photo?v=abc&size=thumb"]);
  });

  it("NFR-12 US-WAC-06 a replaced photo has a new version, so it is requested anew and the old picture is not reused", async () => {
    const before = renderHook(() => useStoredPhoto(access, `${path(8)}?v=old`));
    await waitFor(() => expect(typeof before.result.current).toBe("string"));
    before.unmount();
    const after = renderHook(() => useStoredPhoto(access, `${path(8)}?v=new`));
    await waitFor(() => expect(typeof after.result.current).toBe("string"));
    expect(fetched).toEqual([
      "http://api/specimens/s1/measurements/m8/photo?v=old",
      "http://api/specimens/s1/measurements/m8/photo?v=new",
    ]);
    expect(after.result.current).not.toBe(before.result.current);
  });

  it("NFR-12 a failed request is not kept: the next mount asks again", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url) => {
        fetched.push(String(url));
        return new Response(
          JSON.stringify({ error: { code: "measurement.photo_not_found", text: "x" } }),
          {
            status: 404,
          },
        );
      }),
    );
    const first = renderHook(() => useStoredPhoto(access, path(6), { size: "thumb" }));
    await waitFor(() =>
      expect(first.result.current).toMatchObject({ code: "measurement.photo_not_found" }),
    );
    first.unmount();
    const again = renderHook(() => useStoredPhoto(access, path(6), { size: "thumb" }));
    await waitFor(() =>
      expect(again.result.current).toMatchObject({ code: "measurement.photo_not_found" }),
    );
    expect(fetched).toHaveLength(2);
  });
});

describe("NFR-12 the blob cache is bounded and never revokes a picture that is shown", () => {
  it("NFR-12 an object URL is revoked when the cache forgets the picture and nothing shows it", async () => {
    const old = renderHook(() => useStoredPhoto(access, path(100), { size: "thumb" }));
    await waitFor(() => expect(typeof old.result.current).toBe("string"));
    const oldUrl = old.result.current as string;
    old.unmount();
    const others = Array.from({ length: 200 }, (_, i) =>
      renderHook(() => useStoredPhoto(access, path(200 + i), { size: "thumb" })),
    );
    await waitFor(() =>
      expect(others.every((h) => typeof h.result.current === "string")).toBe(true),
    );
    expect(revoked).toEqual([oldUrl]);
  });

  it("NFR-12 a picture that is still shown is not revoked when the cache forgets it, only when it leaves the screen", async () => {
    const shown = renderHook(() => useStoredPhoto(access, path(300), { size: "thumb" }));
    await waitFor(() => expect(typeof shown.result.current).toBe("string"));
    const shownUrl = shown.result.current as string;
    const others = Array.from({ length: 200 }, (_, i) =>
      renderHook(() => useStoredPhoto(access, path(400 + i), { size: "thumb" })),
    );
    await waitFor(() =>
      expect(others.every((h) => typeof h.result.current === "string")).toBe(true),
    );
    expect(revoked).not.toContain(shownUrl);
    expect(shown.result.current).toBe(shownUrl);
    shown.unmount();
    expect(revoked).toContain(shownUrl);
  });

  it("NFR-12 the cache also stays under a byte budget, so big pictures cannot pile up", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url) => {
        fetched.push(String(url));
        return { ok: true, status: 200, blob: async () => picture(20 * MB) } as unknown as Response;
      }),
    );
    const first = renderHook(() => useStoredPhoto(access, path(500)));
    await waitFor(() => expect(typeof first.result.current).toBe("string"));
    const firstUrl = first.result.current as string;
    first.unmount();
    const second = renderHook(() => useStoredPhoto(access, path(501)));
    await waitFor(() => expect(typeof second.result.current).toBe("string"));
    expect(revoked).toEqual([firstUrl]);
  });

  it("NFR-12 clearing the cache (sign-out) revokes what nobody shows and keeps what is still on screen", async () => {
    const shown = renderHook(() => useStoredPhoto(access, path(600), { size: "thumb" }));
    await waitFor(() => expect(typeof shown.result.current).toBe("string"));
    const hidden = renderHook(() => useStoredPhoto(access, path(601), { size: "thumb" }));
    await waitFor(() => expect(typeof hidden.result.current).toBe("string"));
    hidden.unmount();
    const hiddenUrl = hidden.result.current as string;
    clearPhotoCache();
    expect(revoked).toEqual([hiddenUrl]);
    expect(revoked).not.toContain(shown.result.current);
  });
});
