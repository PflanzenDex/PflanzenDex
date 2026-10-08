import type { SpecimenHint } from "@pflanzendex/core";
import { call, type Response } from "../../../kernel";

/** Loads the hints about incomplete specimens of the account (US-BES-08); derived, never stored. */
export async function loadSpecimenHints(
  api: string,
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<Response<readonly SpecimenHint[]>> {
  const r = await call<{ hints: SpecimenHint[] }>(fetchFn, `${api}/specimens/hints`, token);
  return r.ok ? { ok: true, value: r.value.hints } : r;
}
