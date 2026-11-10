import { describe, expect, it } from "vitest";
import { imageReader, imageStorage } from "./image-storage";
import { FakeImageProcessor, InMemoryObjectStore } from "./object-store.fake";
import { thumbnailName } from "./keys";
import { MEDIA_LIMITS } from "./types";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const NAME = "33333333-3333-4333-8333-333333333333.webp";
const FULL = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 1, 1, 1]);
const SMALL = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 2, 2]);

/** A stored upload as the pipeline leaves it: the stored copy and its thumbnail under the thumbnail name. */
async function uploaded(store: InMemoryObjectStore, account = A) {
  await store.put(account, NAME, FULL, "image/webp");
  await store.put(account, thumbnailName(NAME), SMALL, "image/webp");
}

describe("NFR-12 the thumbnail name", () => {
  it("NFR-12 is derived from the stored name, valid as an object name and never the name of another image", () => {
    const small = thumbnailName(NAME);
    expect(small).toBe("33333333-3333-4333-8333-333333333333-thumb.webp");
    expect(MEDIA_LIMITS.namePattern.test(small)).toBe(true);
    expect(small).not.toBe(NAME);
  });
});

describe("NFR-12 reading the image in the size asked", () => {
  it("NFR-12 the thumbnail size answers the thumbnail, the full size the stored copy", async () => {
    const store = new InMemoryObjectStore();
    await uploaded(store);
    const reader = imageReader(store);
    const small = await reader.read(A, NAME, "thumb");
    const full = await reader.read(A, NAME, "full");
    expect(small.ok && [...small.value.bytes]).toEqual([...SMALL]);
    expect(full.ok && [...full.value.bytes]).toEqual([...FULL]);
  });

  it("NFR-12 an upload without a thumbnail (before the variant existed) answers the full image for the thumbnail size, never not found", async () => {
    const store = new InMemoryObjectStore();
    await store.put(A, NAME, FULL, "image/webp");
    const r = await imageReader(store).read(A, NAME, "thumb");
    expect(r.ok && [...r.value.bytes]).toEqual([...FULL]);
  });

  it("NFR-12 a missing image is media.not_found in both sizes", async () => {
    const store = new InMemoryObjectStore();
    for (const size of ["thumb", "full"] as const) {
      const r = await imageReader(store).read(A, NAME, size);
      expect(!r.ok && r.error.code).toBe("media.not_found");
    }
  });

  it("NFR-12 another account never reads the thumbnail of an image (P-04)", async () => {
    const store = new InMemoryObjectStore();
    await uploaded(store, A);
    const reader = imageReader(store);
    for (const size of ["thumb", "full"] as const) {
      const r = await reader.read(B, NAME, size);
      expect(!r.ok && r.error.code).toBe("media.not_found");
    }
  });

  it("NFR-12 an invalid name is refused before any object is read", async () => {
    const store = new InMemoryObjectStore();
    const r = await imageReader(store).read(A, "../x.webp", "thumb");
    expect(!r.ok && r.error.code).toBe("media.name_invalid");
  });
});

describe("NFR-12 removing an image takes its thumbnail along", () => {
  it("NFR-12 remove deletes the stored copy and the thumbnail", async () => {
    const store = new InMemoryObjectStore();
    await uploaded(store);
    const r = await imageStorage({ store, processor: new FakeImageProcessor() }).remove(A, NAME);
    expect(r.ok).toBe(true);
    expect(store.objectCount()).toBe(0);
  });

  it("NFR-12 removing an image that has no thumbnail still succeeds", async () => {
    const store = new InMemoryObjectStore();
    await store.put(A, NAME, FULL, "image/webp");
    const r = await imageStorage({ store, processor: new FakeImageProcessor() }).remove(A, NAME);
    expect(r.ok).toBe(true);
    expect(store.objectCount()).toBe(0);
  });

  it("NFR-12 deleting the account removes the thumbnails with the stored copies (US-ACC-04)", async () => {
    const store = new InMemoryObjectStore();
    await uploaded(store, A);
    await uploaded(store, B);
    const removed = await store.deleteAll(A);
    expect(removed).toEqual({ ok: true, value: 2 });
    expect(store.objectCount()).toBe(2);
    expect((await imageReader(store).read(B, NAME, "thumb")).ok).toBe(true);
  });
});
