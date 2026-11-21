import { useCallback, useEffect, useRef, useState } from "react";
import type { LightLocation, LightZone } from "@pflanzendex/core";
import { isOnline, useOnline } from "@/shared/platform/browser/network";
import {
  createWrite,
  SIGN_IN,
  useQueryClient,
  type ApiError,
  type QueryClient,
  newRepeatKey,
} from "../../../../../shared/data";
import { refreshLight, sharedLocations, sharedZones } from "../../../../../light";

type Token = () => Promise<string | undefined>;

/** `ok` when the account has a place for the first plant; otherwise the reason it has none (US-ONB-02, issue 2127). */
export type HomeResult = { ok: true } | { ok: false; error: ApiError };

/**
 * Makes sure the account has a place for the first plant: the server lays out the default location "Zuhause" only for an
 * account without locations and refuses otherwise (US-ONB-02). A refusal while online with a location that exists now (it
 * was created meanwhile, e.g. on another device) is no failure. A location that was laid out refreshes the shared light
 * data (issue 1244). A failed read or write comes back with its reason, never as a silent `ok` (P-10, issue 2127).
 */
export async function ensureHome(
  client: QueryClient,
  api: string,
  token: string,
): Promise<HomeResult> {
  const own = await sharedLocations(client, api, token);
  if (!own.ok) return { ok: false, error: own.error };
  if (own.value.length > 0) return { ok: true };
  // A per-send key: the location defaults are silent and idempotent; no action of the keeper is repeated here (US-ONB-02).
  const made = await createWrite(api, token, { key: newRepeatKey() })(
    "POST",
    "/locations/defaults",
    {},
  );
  if (made.ok) {
    await refreshLight(client);
    return { ok: true };
  }
  if (isOnline()) {
    // The copies are asked again: a location created meanwhile must not stay hidden behind the shared copy.
    await refreshLight(client);
    const again = await sharedLocations(client, api, token);
    if (again.ok && again.value.length > 0) return { ok: true };
  }
  return { ok: false, error: made.error };
}

export interface Places {
  readonly locations: readonly LightLocation[];
  readonly zones: readonly LightZone[];
}

type PlacesResult = { ok: true; places: Places } | { ok: false; error: ApiError };

/** The places of the account for the question, or the reason they could not be made or read (US-ONB-02, issue 2127). */
async function loadPlaces(client: QueryClient, api: string, token: Token): Promise<PlacesResult> {
  const t = await token();
  if (!t) return { ok: false, error: SIGN_IN };
  const home = await ensureHome(client, api, t);
  if (!home.ok) return home;
  const [l, z] = await Promise.all([sharedLocations(client, api, t), sharedZones(client, api, t)]);
  if (!l.ok) return { ok: false, error: l.error };
  if (!z.ok) return { ok: false, error: z.error };
  return { ok: true, places: { locations: l.value, zones: z.value } };
}

/**
 * The places of the question "Wo steht sie?". `places` is `null` while they load and after a failure, which comes with its
 * `error` (P-10); `retry` clears it and loads again. Going back online while an error is held loads them once more; an
 * error that arrives while the device is online waits for the press, so a refusal does not loop (issue 2127).
 */
export function usePlaces(api: string, token: Token) {
  const [places, setPlaces] = useState<Places | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  // Counts the asks for a load: the first one, each retry, and a load whose inputs changed while it ran.
  const [asks, setAsks] = useState(0);
  // One load at a time: a load that still runs is not started again.
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
    if (places !== null || error !== null || running.current) return;
    let current = true;
    running.current = true;
    void loadPlaces(client, api, token).then((r) => {
      running.current = false;
      if (!current) {
        // The inputs changed while the load ran: its answer is not shown, and the current inputs are loaded instead.
        setAsks((n) => n + 1);
        return;
      }
      if (r.ok) setPlaces(r.places);
      else setError(r.error);
    });
    return () => {
      current = false;
    };
  }, [api, token, places, error, asks, client]);

  return { places, error, retry };
}
