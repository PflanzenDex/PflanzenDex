import type { DifficultyRow } from "@pflanzendex/core";
import { call, type Response } from "../kernel";

/** Loads the species of the account compared by difficulty (US-BES-05); derived, never stored. */
export async function loadDifficulty(
  api: string,
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<Response<readonly DifficultyRow[]>> {
  const r = await call<{ rows: DifficultyRow[] }>(fetchFn, `${api}/specimens/difficulty`, token);
  return r.ok ? { ok: true, value: r.value.rows } : r;
}
