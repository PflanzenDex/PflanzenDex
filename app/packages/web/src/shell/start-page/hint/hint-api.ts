import { call, createWrite, currentTimeZone, type Response } from "../../../kernel";

/** The one hint that may show now (or none) and the stored end of the first-plant guide (US-ONB-07, DM-ONB-03). */
export type HintState = { hint: string | null; guideEnded: boolean };

export function loadHints(
  api: string,
  token: string,
  applicable: readonly string[],
  fetchFn: typeof fetch = fetch,
): Promise<Response<HintState>> {
  const zone = encodeURIComponent(currentTimeZone());
  const list = encodeURIComponent(applicable.join(","));
  return call<HintState>(
    fetchFn,
    `${api}/onboarding/hints?timeZone=${zone}&applicable=${list}`,
    token,
  );
}

/** Stores that a hint was shown or dismissed, or that the guide ended; per account, not per device (DM-ONB-03). */
export function saveHint(
  api: string,
  token: string,
  occasion: string,
  state: "shown" | "dismissed",
): Promise<Response<unknown>> {
  return createWrite(api, token)("PUT", `/onboarding/hints/${encodeURIComponent(occasion)}`, {
    state,
    timeZone: currentTimeZone(),
  });
}
