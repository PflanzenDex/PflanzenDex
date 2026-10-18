import { call, createWrite, currentTimeZone, type Response } from "../../../kernel";

export type KeeperStyle = "few" | "many";

/** `chosen` is false until the keeper answered or skipped the question (US-ONB-03); `few` is the default meanwhile. */
export type KeeperStyleState = { style: KeeperStyle; chosen: boolean };

export function loadKeeperStyle(
  api: string,
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<Response<KeeperStyleState>> {
  return call<KeeperStyleState>(fetchFn, `${api}/onboarding/style`, token);
}

/** Sets the style (US-ONB-03); skipping the question sends `few`. The time zone gives the unlock date of the switch (NFR-08). */
export async function saveKeeperStyle(
  api: string,
  token: string,
  style: KeeperStyle,
  fetchFn: typeof fetch = fetch,
): Promise<Response<KeeperStyleState>> {
  const r = await createWrite(api, token, fetchFn)("PUT", "/onboarding/style", {
    style,
    timeZone: currentTimeZone(),
  });
  return r.ok
    ? { ok: true, value: { style: (r.value as { style: KeeperStyle }).style, chosen: true } }
    : r;
}
