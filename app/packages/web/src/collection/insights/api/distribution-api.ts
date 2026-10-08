import type { Distribution } from "@pflanzendex/core";
import { call, type Response } from "../../../kernel";

/** Loads the distribution of the own specimens over the light zones (US-LIC-02); derived, never stored. */
export async function loadDistribution(
  api: string,
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<Response<Distribution>> {
  const r = await call<{ distribution: Distribution }>(
    fetchFn,
    `${api}/specimens/distribution`,
    token,
  );
  return r.ok ? { ok: true, value: r.value.distribution } : r;
}
