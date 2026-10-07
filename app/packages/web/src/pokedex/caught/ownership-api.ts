import type { Ownership } from "@pflanzendex/core";
import { call, currentTimeZone, type Response } from "../../kernel";

/**
 * Loads which species the account has caught (US-POK-06) with the catch date (US-POK-07); derived from the specimens,
 * never stored. The time zone of the profile (device zone as fallback, US-ACC-02) decides the local date of a creation moment (NFR-08).
 */
export async function loadOwnership(
  api: string,
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<Response<Ownership>> {
  const timeZone = currentTimeZone();
  const r = await call<{ ownership: Ownership }>(
    fetchFn,
    `${api}/pokedex/ownership?timeZone=${encodeURIComponent(timeZone)}`,
    token,
  );
  return r.ok ? { ok: true, value: r.value.ownership } : r;
}
