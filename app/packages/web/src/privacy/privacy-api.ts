import { call, createWrite, type ApiError, type Response } from "../kernel";

type FetchFn = typeof fetch;

/** Whether the deletion of the account is requested, and when it happens (US-ACC-04). */
export type DeletionState =
  { requested: false } | { requested: true; requestedAt: string; dueAt: string };

export const loadDeletion = (api: string, token: string, fetchFn: FetchFn = fetch) =>
  call<DeletionState>(fetchFn, `${api}/account/deletion`, token);

/** Requests the deletion after the keeper confirmed it; nothing is removed before the deadline. */
export async function requestDeletion(
  api: string,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<DeletionState>> {
  const r = await createWrite(api, token, fetchFn)("POST", "/account/deletion", { confirm: true });
  return r.ok ? { ok: true, value: r.value as DeletionState } : r;
}

export async function cancelDeletion(
  api: string,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<DeletionState>> {
  const r = await createWrite(api, token, fetchFn)("DELETE", "/account/deletion");
  return r.ok ? { ok: true, value: r.value as DeletionState } : r;
}

export type ExportFile = { blob: Blob; missingPhotos: number };

const UNREACHABLE: ApiError = {
  code: "network.not_reachable",
  text: "Der Server ist gerade nicht erreichbar. Bitte versuche es gleich noch einmal.",
};

/** Fetches the ZIP archive with all own data (US-ACC-04); the count of photos the store no longer holds comes along. */
export async function fetchExport(
  api: string,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<ExportFile>> {
  try {
    const res = await fetchFn(`${api}/account/export`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: ApiError };
      return { ok: false, error: body.error ?? UNREACHABLE };
    }
    return {
      ok: true,
      value: {
        blob: await res.blob(),
        missingPhotos: Number(res.headers.get("x-missing-photos") ?? 0) || 0,
      },
    };
  } catch {
    return { ok: false, error: UNREACHABLE };
  }
}

/** Hands the file to the browser as a download. */
export function saveFile(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
