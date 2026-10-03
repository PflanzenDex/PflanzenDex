import type { SpecimenCard } from "@pflanzendex/core";
import { call, type Response } from "../kernel";

/** Loads the cards of the own specimens; the device's time zone determines "today" for the due date (NFR-08). */
export async function loadCards(
  api: string,
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<Response<readonly SpecimenCard[]>> {
  const timeZone = encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const r = await call<{ cards: SpecimenCard[] }>(
    fetchFn,
    `${api}/specimens/cards?timeZone=${timeZone}`,
    token,
  );
  return r.ok ? { ok: true, value: r.value.cards } : r;
}
