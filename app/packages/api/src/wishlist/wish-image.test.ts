import { describe, expect, it, vi } from "vitest";
import { MEDIA_LIMITS } from "@pflanzendex/core";
import { createWikimediaDownload } from "./wish-image";

const URL_OK = "https://upload.wikimedia.org/wikipedia/commons/a/ab/Monstera_deliciosa.jpg";
const make = (response: () => Response | Promise<Response>) => {
  const fetchFn = vi.fn<typeof fetch>(async () => response());
  return { fetchFn, download: createWikimediaDownload({ fetch: fetchFn, userAgent: "Test/1" }) };
};
const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? null : r.error?.code);

describe("US-WUN-04 download of the original from Wikimedia", () => {
  it("returns the bytes and the content type, asks without following redirects and names itself", async () => {
    const { fetchFn, download } = make(
      () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } }),
    );
    const r = await download.get(URL_OK);
    expect(r.ok && [Array.from(r.value.bytes), r.value.contentType]).toEqual([
      [1, 2, 3],
      "image/jpeg",
    ]);
    const [, init] = fetchFn.mock.calls[0] ?? [];
    expect(init?.redirect).toBe("error");
    expect((init?.headers as Record<string, string>)["User-Agent"]).toBe("Test/1");
  });

  it("refuses every address outside upload.wikimedia.org before any request (no SSRF)", async () => {
    const { fetchFn, download } = make(() => new Response("x"));
    for (const url of [
      "http://upload.wikimedia.org/a.jpg",
      "https://example.com/a.jpg",
      "https://upload.wikimedia.org.evil.test/a.jpg",
      "https://user:pw@upload.wikimedia.org/a.jpg",
      "https://localhost/a.jpg",
      "garbage",
    ])
      expect(code(await download.get(url)), url).toBe("wish.image_source_unsupported");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("a missing file is wish.image_not_found, other failures are source.unavailable (P-10)", async () => {
    expect(code(await make(() => new Response("", { status: 404 })).download.get(URL_OK))).toBe(
      "wish.image_not_found",
    );
    expect(code(await make(() => new Response("", { status: 503 })).download.get(URL_OK))).toBe(
      "source.unavailable",
    );
    const broken = createWikimediaDownload({
      fetch: async () => {
        throw new Error("network");
      },
      userAgent: "T",
    });
    expect(code(await broken.get(URL_OK))).toBe("source.unavailable");
  });

  it("a file larger than the upload limit is refused (media.too_large), announced or not", async () => {
    const announced = make(
      () =>
        new Response("x", {
          headers: { "content-length": String(MEDIA_LIMITS.uploadMaxBytes + 1) },
        }),
    );
    expect(code(await announced.download.get(URL_OK))).toBe("media.too_large");
    const big = make(() => new Response(new Uint8Array(MEDIA_LIMITS.uploadMaxBytes + 1)));
    expect(code(await big.download.get(URL_OK))).toBe("media.too_large");
  });
});
