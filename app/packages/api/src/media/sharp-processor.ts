import sharp from "sharp";
import { MEDIA_LIMITS, appError } from "@pflanzendex/core";
import type { ImageProcessor } from "@pflanzendex/core";

const READABLE = new Set(["jpeg", "png", "webp"]);

/**
 * The processing stage (FR-WAC-09, QG-D3): rotate by the EXIF orientation, shrink to the maximum edge, re-encode as
 * JPEG. sharp writes no metadata unless asked (`keepMetadata`/`withExif` are never called), so EXIF, GPS, XMP, IPTC and
 * the ICC profile are gone; the decoded pixels are re-encoded, never copied byte for byte.
 */
export function createSharpProcessor(
  options: { readonly maxPixels?: number } = {},
): ImageProcessor {
  const limitInputPixels = options.maxPixels ?? MEDIA_LIMITS.inputMaxPixels;
  return {
    async process(input) {
      try {
        const image = sharp(input, { limitInputPixels, failOn: "error" });
        const { format } = await image.metadata();
        if (!format || !READABLE.has(format)) return refuse("media.not_an_image");
        const { data, info } = await image
          .rotate()
          .resize({
            width: MEDIA_LIMITS.maxEdgePx,
            height: MEDIA_LIMITS.maxEdgePx,
            fit: "inside",
            withoutEnlargement: true,
          })
          .flatten({ background: "#ffffff" })
          .jpeg({ quality: MEDIA_LIMITS.jpegQuality })
          .toBuffer({ resolveWithObject: true });
        return {
          ok: true,
          value: {
            bytes: new Uint8Array(data),
            contentType: MEDIA_LIMITS.storedType,
            width: info.width,
            height: info.height,
          },
        };
      } catch (cause) {
        const overLimit = cause instanceof Error && /pixel limit/i.test(cause.message);
        return refuse(overLimit ? "media.too_large" : "media.not_an_image", cause);
      }
    },
  };
}

const refuse = (code: "media.too_large" | "media.not_an_image", cause?: unknown) =>
  ({ ok: false, error: appError(code, { cause }) }) as const;
