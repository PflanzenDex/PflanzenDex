import { call, createWrite, type Response } from "../kernel";

/** The seen species keys of the account (US-POK-12); `null` while the account has no state yet (first visit). */
export async function loadSeen(
  api: string,
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<Response<string[] | null>> {
  const r = await call<{ seen: string[] | null }>(fetchFn, `${api}/pokedex/seen`, token);
  return r.ok ? { ok: true, value: r.value.seen } : r;
}

/** Marks species as seen (US-POK-12): "Okay" on the banner, and the silent creation on the first visit. */
export async function markSeen(
  api: string,
  token: string,
  species: readonly string[],
  fetchFn: typeof fetch = fetch,
): Promise<Response<{ seen: string[] }>> {
  const r = await createWrite(api, token, fetchFn)("POST", "/pokedex/seen", { species });
  return r.ok ? { ok: true, value: r.value as { seen: string[] } } : r;
}
