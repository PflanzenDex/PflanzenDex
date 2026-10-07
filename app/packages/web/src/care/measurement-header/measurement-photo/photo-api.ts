import { MEDIA_LIMITS } from "@pflanzendex/core";
import { currentTimeZone, type ApiError, type Response } from "../../../kernel";
import { GENERIC_ERROR_TEXT } from "@/lib/error-text";

type FetchFn = typeof fetch;
export interface PhotoAccess {
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

/** Loads the stored photo of a measurement (private: only with the token, P-05) as an object URL. */
export async function loadPhoto(
  access: PhotoAccess,
  specimenId: string,
  measurementId: string,
): Promise<Response<string>> {
  try {
    const res = await (access.fetchFn ?? fetch)(
      `${access.api}/specimens/${encodeURIComponent(specimenId)}/measurements/${encodeURIComponent(measurementId)}/photo`,
      { headers: { Authorization: `Bearer ${access.token}` } },
    );
    if (!res.ok) return await failure(res);
    return { ok: true, value: URL.createObjectURL(await res.blob()) };
  } catch {
    return { ok: false, error: NETWORK };
  }
}

/** Sends the raw image file for the measurement of `date` (US-WAC-06); a fresh `Idempotency-Key` per call. */
export async function uploadPhoto(
  access: PhotoAccess,
  specimenId: string,
  photo: { file: File; date?: string; replace?: boolean },
): Promise<Response<unknown>> {
  const query = new URLSearchParams({ timeZone: currentTimeZone() });
  if (photo.date) query.set("date", photo.date);
  if (photo.replace) query.set("replace", "true");
  try {
    const res = await (access.fetchFn ?? fetch)(
      `${access.api}/specimens/${encodeURIComponent(specimenId)}/measurements/photo?${query}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access.token}`,
          "Content-Type": photo.file.type,
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: photo.file,
      },
    );
    return res.ok ? { ok: true, value: await res.json().catch(() => ({})) } : await failure(res);
  } catch {
    return { ok: false, error: NETWORK };
  }
}

/** Quick check before sending (the server checks again, P-03): type and size. `null` means fine. */
export function photoProblem(file: File): string | null {
  if (!(MEDIA_LIMITS.uploadTypes as readonly string[]).includes(file.type))
    return "Bitte wähle ein Foto als JPEG, PNG oder WebP.";
  if (file.size > MEDIA_LIMITS.uploadMaxBytes)
    return `Das Foto ist zu groß. Erlaubt sind bis zu ${MEDIA_LIMITS.uploadMaxBytes / 1024 / 1024} MB.`;
  return null;
}
