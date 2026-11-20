import { useCallback, useEffect, useRef, useState } from "react";
import type { LightZone } from "@pflanzendex/core";
import { useOnline } from "@/shared/platform/browser/network";
import {
  createWrite,
  SIGN_IN,
  useQueryClient,
  type ApiError,
  type QueryClient,
} from "../../../../../shared/data";
import { refreshLight, sharedZones } from "../../../../../light";
import { ensureHome } from "../where-question/use-places";

type Token = () => Promise<string | undefined>;

/** The own zones, or the reason they could not be read or made (issue 2098). */
type OwnZones = { ok: true; zones: readonly LightZone[] } | { ok: false; error: ApiError };

/**
 * The own zones; a new account has none yet, so the standard lamps are laid out first (US-ONB-02 gives them from the
 * start). A failure comes back with its reason, never as an empty list: the keeper sees why and can retry (US-ONB-01,
 * issue 2098).
 */
async function ownZones(client: QueryClient, api: string, token: Token): Promise<OwnZones> {
  const t = await token();
  if (!t) return { ok: false, error: SIGN_IN };
  const first = await sharedZones(client, api, t);
  if (!first.ok) return { ok: false, error: first.error };
  if (first.value.length > 0) {
    // The result is not shown here: the where question reports a default location that could not be made (issue 2127).
    await ensureHome(client, api, t);
    return { ok: true, zones: first.value };
  }
  const made = await createWrite(api, t)("POST", "/light-zones/defaults", {});
  if (!made.ok) return { ok: false, error: made.error };
  // The new zones refresh the shared light data (issue 1244); the default location "Zuhause" comes with them (US-ONB-02).
  await refreshLight(client);
  // The result is not shown here: the where question reports a default location that could not be made (issue 2127).
  await ensureHome(client, api, t);
  const again = await sharedZones(client, api, t);
  return again.ok ? { ok: true, zones: again.value } : { ok: false, error: again.error };
}

/**
 * Light zones of the account for the save step. `zones` is `null` while they load and after a failure, which comes with
 * its `error`; `retry` clears the error and loads again. Going back online while an error is held loads them once more
 * (US-ONB-01, issue 2098).
 */
export function useOwnZones(api: string, token: Token, enabled: boolean) {
  const [zones, setZones] = useState<readonly LightZone[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  // Counts the asks for a load: the first one, each retry, and a load whose inputs changed while it ran.
  const [asks, setAsks] = useState(0);
  // One load at a time: a load that still runs is not started again (issue 2098).
  const running = useRef(false);
  const client = useQueryClient();
  const online = useOnline();
  const wasOnline = useRef(online);

  const retry = useCallback(() => {
    setError(null);
    setAsks((n) => n + 1);
  }, []);

  // Only the moment the device comes back online counts: an error that arrives while it is online waits for a press.
  useEffect(() => {
    const back = online && !wasOnline.current;
    wasOnline.current = online;
    if (back && error !== null) retry();
  }, [online, error, retry]);

  useEffect(() => {
    if (!enabled || zones !== null || error !== null || running.current) return;
    let current = true;
    running.current = true;
    void ownZones(client, api, token).then((r) => {
      running.current = false;
      if (!current) {
        // The inputs changed while the load ran: its answer is not shown, and the current inputs are loaded instead.
        setAsks((n) => n + 1);
        return;
      }
      if (r.ok) setZones(r.zones);
      else setError(r.error);
    });
    return () => {
      current = false;
    };
  }, [api, token, enabled, zones, error, asks, client]);

  return { zones, error, retry };
}
