import { MEDIA_LIMITS, appError, failed, ok, type ImageDownload } from "@pflanzendex/core";

/** Only Wikimedia's own upload host is ever contacted for an image (US-WUN-04): no foreign host, no SSRF. */
const ORIGINAL = /^https:\/\/upload\.wikimedia\.org\/[^\s@]*$/;
const TIMEOUT_MS = 20_000;

/**
 * Downloads the original of a Commons image (US-WUN-04). The address was derived from the Commons API answer, but
 * is checked again here: https, host `upload.wikimedia.org`, no credentials, no redirect, a time limit and the upload
 * size limit (announced and real). A missing file is `wish.image_not_found`, any other failure `source.unavailable`.
 */
export function createWikimediaDownload(deps: {
  fetch: typeof fetch;
  userAgent: string;
}): ImageDownload {
  return {
    async get(url) {
      if (!ORIGINAL.test(url)) return failed(appError("wish.image_source_unsupported"));
      try {
        const res = await deps.fetch(url, {
          redirect: "error",
          signal: AbortSignal.timeout(TIMEOUT_MS),
          headers: { "User-Agent": deps.userAgent },
        });
        if (res.status === 404) return failed(appError("wish.image_not_found"));
        if (!res.ok) return failed(appError("source.unavailable"));
        if (Number(res.headers.get("content-length") ?? 0) > MEDIA_LIMITS.uploadMaxBytes)
          return failed(appError("media.too_large"));
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (bytes.byteLength > MEDIA_LIMITS.uploadMaxBytes)
          return failed(appError("media.too_large"));
        return ok({ bytes, contentType: res.headers.get("content-type") ?? "" });
      } catch {
        return failed(appError("source.unavailable"));
      }
    },
  };
}
