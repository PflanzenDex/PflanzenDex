import type { Ownership } from "@pflanzendex/core";
import { call, type Response } from "../kernel";

/** Loads which species the account has caught (US-POK-06); derived from the specimens, never stored. */
export async function loadOwnership(
  api: string,
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<Response<Ownership>> {
  const r = await call<{ ownership: Ownership }>(fetchFn, `${api}/pokedex/ownership`, token);
  return r.ok ? { ok: true, value: r.value.ownership } : r;
}
