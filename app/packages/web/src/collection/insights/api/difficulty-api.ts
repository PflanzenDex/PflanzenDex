import type { DifficultyOverview } from "@pflanzendex/core";
import { call, type Response } from "../../../kernel";

/** Loads the species of the account compared by difficulty (US-BES-05); derived, never stored. */
export async function loadDifficulty(
  api: string,
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<Response<DifficultyOverview>> {
  const r = await call<DifficultyOverview>(fetchFn, `${api}/specimens/difficulty`, token);
  // An answer without the count (older API during a deploy) counts as nothing unreadable.
  return r.ok
    ? { ok: true, value: { rows: r.value.rows, unreadable: r.value.unreadable ?? 0 } }
    : r;
}
