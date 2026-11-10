import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { InMemoryObjectStore, MEDIA_LIMITS, storeImage, thumbnailName } from "@pflanzendex/core";
import { createSharpProcessor } from "./index";

// Contract of the port `ImageProcessor` (TE-05, QG-D3, FR-WAC-09, issue 1289) with the real image library and the in-memory store (no S3 here: see s3-store.test.ts).
const A = "11111111-1111-4111-8111-111111111111";
const processor = createSharpProcessor();

/** Metadata chunks of a WebP file (RIFF container): EXIF, XMP and the ICC profile each have a chunk of their own. */
function metadataChunks(webp: Uint8Array): string[] {
  const bytes = Buffer.from(webp);
  const found: string[] = [];
  for (let i = 12; i + 8 <= bytes.length;) {
    const type = bytes.subarray(i, i + 4).toString("latin1");
    const size = bytes.readUInt32LE(i + 4);
    if (type === "EXIF" || type === "XMP " || type === "ICCP") found.push(type);
    i += 8 + size + (size % 2);
  }
  return found;
}

/** Marker segments of a JPEG before the image data: APP1 carries EXIF/GPS/XMP, 0xFFFE is a comment. */
function metadataSegments(jpeg: Uint8Array): number[] {
  const found: number[] = [];
  for (let i = 2; i + 4 < jpeg.length && jpeg[i] === 0xff && jpeg[i + 1] !== 0xda;) {
    const marker = jpeg[i + 1] as number;
    if (marker === 0xfe || (marker >= 0xe1 && marker <= 0xef)) found.push(marker);
    i += 2 + ((jpeg[i + 2] as number) << 8) + (jpeg[i + 3] as number);
  }
  return found;
}

const gpsPhoto = (width: number, height: number, orientation = 1) =>
  sharp({ create: { width, height, channels: 3, background: "#2a7a3a" } })
    .jpeg()
    .withExif({
      IFD0: { Make: "TestCam", Software: "secret-app" },
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: "51/1 30/1 0/1",
        GPSLongitudeRef: "E",
        GPSLongitude: "7/1 0/1 0/1",
      },
    })
    .withMetadata({ orientation })
    .toBuffer();

/** A photo with fine detail, so that two quality settings really give two different files. */
const detailedPhoto = (width: number, height: number) =>
  sharp({
    create: {
      width,
      height,
      channels: 3,
      background: "#808080", // replaced by the noise below
      noise: { type: "gaussian", mean: 128, sigma: 40 },
    },
  })
    .jpeg()
    .toBuffer();

async function upload(bytes: Uint8Array, contentType = "image/jpeg") {
  const store = new InMemoryObjectStore();
  const result = await storeImage({ store, processor }, A, "photo-1.webp", { bytes, contentType });
  return { store, result };
}

describe("TE-05 / QG-D3 photo pipeline with sharp", () => {
  it("QG-D3 NFR-12 a test image with GPS EXIF is stored as WebP with no EXIF, GPS or any other metadata", async () => {
    const original = await gpsPhoto(400, 300);
    expect(metadataSegments(original).length).toBeGreaterThan(0); // the test image really carries EXIF
    const { store, result } = await upload(original);
    expect(result.ok).toBe(true);
    const stored = await store.get(A, "photo-1.webp");
    if (!stored.ok) throw new Error("not stored");
    expect(stored.value.contentType).toBe("image/webp");
    expect(metadataChunks(stored.value.bytes)).toEqual([]); // a WebP keeps EXIF and XMP as chunks, so none may be there
    expect(Buffer.from(stored.value.bytes).includes("Exif")).toBe(false);
    expect(Buffer.from(stored.value.bytes).includes("TestCam")).toBe(false);
    expect(Buffer.from(stored.value.bytes).includes("secret-app")).toBe(false);
    const meta = await sharp(stored.value.bytes).metadata();
    expect([meta.exif, meta.xmp, meta.icc, meta.iptc]).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    expect(meta.format).toBe("webp");
  });

  it("FR-WAC-09 the original is not stored: the only objects are the processed image and its thumbnail", async () => {
    const original = await gpsPhoto(400, 300);
    const { store } = await upload(original);
    expect(store.objectCount()).toBe(2); // the stored copy and its thumbnail (NFR-12)
    expect(store.containsBytes(original)).toBe(false);
  });

  it("TE-05 the EXIF orientation is applied to the pixels and then dropped", async () => {
    const { store } = await upload(await gpsPhoto(200, 100, 6)); // 6 = rotate 90 degrees clockwise to view
    const stored = await store.get(A, "photo-1.webp");
    const meta = stored.ok ? await sharp(stored.value.bytes).metadata() : null;
    expect([meta?.width, meta?.height, meta?.orientation]).toEqual([100, 200, undefined]);
  });

  it("US-WAC-06 the long side is reduced to the maximum edge, a small image is not enlarged", async () => {
    const big = await upload(await gpsPhoto(3200, 2400));
    expect(big.result).toEqual({
      ok: true,
      value: { name: "photo-1.webp", width: 1600, height: 1200 },
    });
    const small = await upload(await gpsPhoto(300, 200));
    expect(small.result.ok && [small.result.value.width, small.result.value.height]).toEqual([
      300, 200,
    ]);
    expect(MEDIA_LIMITS.maxEdgePx).toBe(1600);
  });

  it("TE-05 a PNG with transparency becomes a WebP on a white background", async () => {
    const png = await sharp({
      create: { width: 20, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
    const { store, result } = await upload(png, "image/png");
    expect(result.ok).toBe(true);
    const stored = await store.get(A, "photo-1.webp");
    const { data } = await sharp(stored.ok ? stored.value.bytes : new Uint8Array())
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([...data.subarray(0, 3)].every((c) => c > 250)).toBe(true);
  });

  it("TE-05 bytes that are not an image are refused with media.not_an_image and nothing is stored", async () => {
    const { store, result } = await upload(new TextEncoder().encode("<html>not an image</html>"));
    expect(!result.ok && result.error.code).toBe("media.not_an_image");
    expect(store.objectCount()).toBe(0);
  });

  it("TE-05 an oversize upload is refused with media.too_large and nothing is stored", async () => {
    const { store, result } = await upload(new Uint8Array(MEDIA_LIMITS.uploadMaxBytes + 1));
    expect(!result.ok && result.error.code).toBe("media.too_large");
    expect(store.objectCount()).toBe(0);
  });

  it("TE-05 an image above the pixel limit is refused with media.too_large", async () => {
    const huge = await sharp({
      create: { width: 8000, height: 8000, channels: 3, background: "#fff" },
    })
      .jpeg({ quality: 1 })
      .toBuffer();
    const refusing = createSharpProcessor({ maxPixels: 1_000_000 });
    const r = await refusing.process(huge);
    expect(!r.ok && r.error.code).toBe("media.too_large");
  });
});

describe("NFR-12 the processed image comes with its thumbnail", () => {
  it("NFR-12 the thumbnail is a WebP with a 256 px long side, upright and without metadata", async () => {
    const processed = await processor.process(await gpsPhoto(3200, 2000, 6));
    if (!processed.ok) throw new Error("not processed");
    const { thumbnail } = processed.value;
    expect([thumbnail.contentType, thumbnail.width, thumbnail.height]).toEqual([
      "image/webp",
      160,
      256,
    ]);
    const meta = await sharp(thumbnail.bytes).metadata();
    expect([meta.format, meta.width, meta.height, meta.exif, meta.orientation]).toEqual([
      "webp",
      160,
      256,
      undefined,
      undefined,
    ]);
    expect(metadataChunks(thumbnail.bytes)).toEqual([]);
    expect(Buffer.from(thumbnail.bytes).includes("TestCam")).toBe(false);
  });

  it("NFR-12 storing keeps the stored copy at 1600 px and writes the thumbnail under the thumbnail name", async () => {
    const original = await gpsPhoto(3200, 2000, 6);
    const { store, result } = await upload(original);
    expect(result.ok).toBe(true);
    const small = await store.get(A, thumbnailName("photo-1.webp"));
    if (!small.ok) throw new Error("no thumbnail");
    expect(store.objectCount()).toBe(2);
    expect((await sharp(small.value.bytes).metadata()).height).toBe(256);
  });
});

describe("NFR-12 US-WAC-06 the WebP qualities are 82 for the copy and 72 for the thumbnail", () => {
  it("NFR-12 US-WAC-06 a stored photo is WebP at quality 82, its thumbnail at 72 (starting values, assumption)", async () => {
    const original = await detailedPhoto(1200, 900);
    const { store, result } = await upload(original);
    expect(result.ok).toBe(true);
    const stored = await store.get(A, "photo-1.webp");
    const small = await store.get(A, thumbnailName("photo-1.webp"));
    if (!stored.ok || !small.ok) throw new Error("not stored");
    // The same operations as the processor, with the quality written out. libwebp is deterministic, so the bytes must match.
    const copy = await sharp(original)
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .webp({ quality: 82 })
      .toBuffer();
    expect(Buffer.from(stored.value.bytes).equals(copy)).toBe(true);
    const thumb = await sharp(stored.value.bytes)
      .resize({ width: 256, height: 256, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 72 })
      .toBuffer();
    expect(Buffer.from(small.value.bytes).equals(thumb)).toBe(true);
    // The check has teeth: the neighbouring quality gives other bytes, so 80 instead of 82 would be seen.
    const other = await sharp(original)
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .webp({ quality: 80 })
      .toBuffer();
    expect(Buffer.from(stored.value.bytes).equals(other)).toBe(false);
    expect([MEDIA_LIMITS.webpQuality, MEDIA_LIMITS.thumbWebpQuality]).toEqual([82, 72]);
  });
});
