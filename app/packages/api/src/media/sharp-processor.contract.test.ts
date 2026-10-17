import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { InMemoryObjectStore, MEDIA_LIMITS, storeImage } from "@pflanzendex/core";
import { createSharpProcessor } from "./index";

// Contract of the port `ImageProcessor` (TE-05, QG-D3, FR-WAC-09) with the real image library and the in-memory store (no S3 here: see s3-store.test.ts).
const A = "11111111-1111-4111-8111-111111111111";
const processor = createSharpProcessor();

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

async function upload(bytes: Uint8Array, contentType = "image/jpeg") {
  const store = new InMemoryObjectStore();
  const result = await storeImage({ store, processor }, A, "photo-1.jpg", { bytes, contentType });
  return { store, result };
}

describe("TE-05 / QG-D3 photo pipeline with sharp", () => {
  it("QG-D3 a test image with GPS EXIF is stored only cleaned: no EXIF, GPS or any other metadata", async () => {
    const original = await gpsPhoto(400, 300);
    expect(metadataSegments(original).length).toBeGreaterThan(0); // the test image really carries EXIF
    const { store, result } = await upload(original);
    expect(result.ok).toBe(true);
    const stored = await store.get(A, "photo-1.jpg");
    if (!stored.ok) throw new Error("not stored");
    expect(metadataSegments(stored.value.bytes)).toEqual([]);
    expect(Buffer.from(stored.value.bytes).includes("Exif")).toBe(false);
    expect(Buffer.from(stored.value.bytes).includes("TestCam")).toBe(false);
    const meta = await sharp(stored.value.bytes).metadata();
    expect([meta.exif, meta.xmp, meta.icc, meta.iptc]).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    expect(meta.format).toBe("jpeg");
  });

  it("FR-WAC-09 the original is not stored: the only object is the processed image", async () => {
    const original = await gpsPhoto(400, 300);
    const { store } = await upload(original);
    expect(store.objectCount()).toBe(1);
    expect(store.containsBytes(original)).toBe(false);
  });

  it("TE-05 the EXIF orientation is applied to the pixels and then dropped", async () => {
    const { store } = await upload(await gpsPhoto(200, 100, 6)); // 6 = rotate 90 degrees clockwise to view
    const stored = await store.get(A, "photo-1.jpg");
    const meta = stored.ok ? await sharp(stored.value.bytes).metadata() : null;
    expect([meta?.width, meta?.height, meta?.orientation]).toEqual([100, 200, undefined]);
  });

  it("US-WAC-06 the long side is reduced to the maximum edge, a small image is not enlarged", async () => {
    const big = await upload(await gpsPhoto(3200, 2400));
    expect(big.result).toEqual({
      ok: true,
      value: { name: "photo-1.jpg", width: 1600, height: 1200 },
    });
    const small = await upload(await gpsPhoto(300, 200));
    expect(small.result.ok && [small.result.value.width, small.result.value.height]).toEqual([
      300, 200,
    ]);
    expect(MEDIA_LIMITS.maxEdgePx).toBe(1600);
  });

  it("TE-05 a PNG with transparency becomes a JPEG on a white background", async () => {
    const png = await sharp({
      create: { width: 20, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
    const { store, result } = await upload(png, "image/png");
    expect(result.ok).toBe(true);
    const stored = await store.get(A, "photo-1.jpg");
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
