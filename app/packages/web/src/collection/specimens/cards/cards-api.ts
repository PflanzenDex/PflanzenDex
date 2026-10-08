import type { SpecimenCard } from "@pflanzendex/core";
import { call, currentTimeZone, type Response } from "../../../kernel";

/** Loads the cards of the own specimens; the device's time zone determines "today" for the due date (NFR-08). */
export async function loadCards(
  api: string,
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<Response<readonly SpecimenCard[]>> {
  const timeZone = encodeURIComponent(currentTimeZone());
  const r = await call<{ cards: SpecimenCard[] }>(
    fetchFn,
    `${api}/specimens/cards?timeZone=${timeZone}`,
    token,
  );
  return r.ok ? { ok: true, value: r.value.cards } : r;
}

/** How many active and archived specimens the account has (for the start page); one cheap count on the server. */
export async function loadSpecimenCount(
  api: string,
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<Response<{ active: number; archived: number }>> {
  const r = await call<{ count: number; archived?: number }>(
    fetchFn,
    `${api}/specimens/count`,
    token,
  );
  // An API from before #291 sends no `archived`: then the start page behaves as it did before (new account).
  return r.ok ? { ok: true, value: { active: r.value.count, archived: r.value.archived ?? 0 } } : r;
}
