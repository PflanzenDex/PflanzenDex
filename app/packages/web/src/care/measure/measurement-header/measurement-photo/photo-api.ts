import { MEDIA_LIMITS } from "@pflanzendex/core";
import {
  announceWrite,
  currentTimeZone,
  withRepeatKey,
  type ApiError,
  type Response,
} from "../../../../shared/data";
import { GENERIC_ERROR_TEXT } from "@/shared/lib/error-text";
import { forgetPhotos } from "@/shared/platform/browser/use-stored-photo";

type FetchFn = typeof fetch;
export interface UploadAccess {
  api: string;
  token: string;
  fetchFn?: FetchFn;
}

const NETWORK: ApiError = {
  code: "network.not_reachable",
  text: "Der Server ist gerade nicht erreichbar. Bitte versuche es gleich noch einmal.",
};

async function failure(res: globalThis.Response): Promise<{ ok: false; error: ApiError }> {
  if (res.status === 401)
    return { ok: false, error: { code: "access.not_signed_in", text: "Bitte melde dich neu an." } };
  const body = (await res.json().catch(() => ({}))) as { error?: ApiError };
  return { ok: false, error: body.error ?? { code: "server.error", text: GENERIC_ERROR_TEXT } };
}

/**
 * SHA-256 of the file content as hex: the identity of a photo for the repeat guard (US-QS-03). It is the same hash the
 * server fingerprints the upload with, so a different photo never shares a key. `null` when the file cannot be read.
 */
async function contentDigest(file: File): Promise<string | null> {
  try {
    const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

/**
 * Sends the raw image file for the measurement of `date` (US-WAC-06). The repeat guard (US-QS-03) takes the write's
 * identity from the path (measurement date, time zone, `replace`) and the file's content: the same file sent again after
 * a lost answer carries the same key and the server answers it with the stored answer, not a second photo; another
 * photo gets its own key. A deliberate replace is another path (`replace=true`), so it is another write.
 */
export async function uploadPhoto(
  access: UploadAccess,
  specimenId: string,
  photo: { file: File; date?: string; replace?: boolean },
): Promise<Response<unknown>> {
  const query = new URLSearchParams({ timeZone: currentTimeZone() });
  if (photo.date) query.set("date", photo.date);
  if (photo.replace) query.set("replace", "true");
  const path = `/specimens/${encodeURIComponent(specimenId)}/measurements/photo?${query}`;
  const digest = await contentDigest(photo.file);
  if (digest === null) return { ok: false, error: NETWORK };
  return withRepeatKey<unknown>(JSON.stringify([access.api, "POST", path, digest]), async (key) => {
    try {
      const res = await (access.fetchFn ?? fetch)(`${access.api}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access.token}`,
          "Content-Type": photo.file.type,
          "Idempotency-Key": key,
        },
        body: photo.file,
      });
      if (!res.ok) return await failure(res);
      // The replaced picture leaves the picture cache at once; the next view asks its new address (NFR-12).
      forgetPhotos(access.api, `/specimens/${encodeURIComponent(specimenId)}/`);
      announceWrite();
      return { ok: true, value: await res.json().catch(() => ({})) };
    } catch {
      return { ok: false, error: NETWORK };
    }
  });
}

/** Quick check before sending (the server checks again, P-03): type and size. `null` means fine. */
export function photoProblem(file: File): string | null {
  if (!(MEDIA_LIMITS.uploadTypes as readonly string[]).includes(file.type))
    return "Bitte wähle ein Foto als JPEG, PNG oder WebP.";
  if (file.size > MEDIA_LIMITS.uploadMaxBytes)
    return `Das Foto ist zu groß. Erlaubt sind bis zu ${MEDIA_LIMITS.uploadMaxBytes / 1024 / 1024} MB.`;
  return null;
}
