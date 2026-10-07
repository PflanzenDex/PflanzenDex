import { describe, expect, it } from "vitest";
import { storeImage } from "./store-image";
import { FakeImageProcessor, InMemoryObjectStore } from "./object-store.fake";
import { MEDIA_LIMITS } from "./types";

const A = "11111111-1111-4111-8111-111111111111";
const original = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 1, 2, 3, 4]); // pretend: JPEG with an EXIF segment
const setup = (processor = new FakeImageProcessor()) => {
  const store = new InMemoryObjectStore();
  return { store, processor, deps: { store, processor } };
};

describe("TE-05 / FR-WAC-09 storing a processed image", () => {
  it("stores only the processed image and never the original", async () => {
    const { store, processor, deps } = setup();
    const r = await storeImage(deps, A, "m1.jpg", { bytes: original, contentType: "image/jpeg" });
    expect(r).toEqual({ ok: true, value: { name: "m1.jpg", width: 800, height: 600 } });
    const stored = await store.get(A, "m1.jpg");
    expect(stored.ok && [...stored.value.bytes]).toEqual([...processor.output.bytes]);
    expect(store.objectCount()).toBe(1);
    expect(store.containsBytes(original)).toBe(false);
  });

  it("rejects an oversize upload with media.too_large before processing and stores nothing", async () => {
    const { store, processor, deps } = setup();
    const big = new Uint8Array(MEDIA_LIMITS.uploadMaxBytes + 1);
    const r = await storeImage(deps, A, "m1.jpg", { bytes: big, contentType: "image/jpeg" });
    expect(!r.ok && r.error.code).toBe("media.too_large");
    expect(processor.calls).toBe(0);
    expect(store.objectCount()).toBe(0);
  });

  it("rejects an upload type that is not jpeg, png or webp with media.type_unsupported", async () => {
    const { store, deps } = setup();
    const r = await storeImage(deps, A, "m1.jpg", { bytes: original, contentType: "image/gif" });
    expect(!r.ok && r.error.code).toBe("media.type_unsupported");
    expect(store.objectCount()).toBe(0);
  });

  it("passes the processor's refusal on and stores nothing", async () => {
    const { store, deps } = setup(new FakeImageProcessor("media.not_an_image"));
    const r = await storeImage(deps, A, "m1.jpg", { bytes: original, contentType: "image/jpeg" });
    expect(!r.ok && r.error.code).toBe("media.not_an_image");
    expect(store.objectCount()).toBe(0);
  });

  it("refuses an invalid name with media.name_invalid", async () => {
    const { deps, processor } = setup();
    const r = await storeImage(deps, A, "../x.jpg", { bytes: original, contentType: "image/jpeg" });
    expect(!r.ok && r.error.code).toBe("media.name_invalid");
    expect(processor.calls).toBe(0);
  });
});
