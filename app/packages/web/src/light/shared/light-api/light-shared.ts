import type { QueryClient } from "../../../shared/data";
import { REFERENCE_STALE_TIME, loadShared } from "../../../shared/data";
import { loadLocations, loadZones } from "./light-api";

/**
 * The key of the light data (zones, locations, the light page). Writes that change them refresh everything under this
 * prefix (`refreshLight`, `useReload`), so the shared copies below never outlive a write of the account (issue 1244).
 */
export const LIGHT_KEY = ["light"] as const;
/** One copy of the zones of the account, read by every screen that shows zones. */
export const ZONES_KEY = [...LIGHT_KEY, "zones"] as const;
/** One copy of the locations of the account, read by every screen that shows locations. */
export const LOCATIONS_KEY = [...LIGHT_KEY, "locations"] as const;

/** The zones of the account: the shared copy while it is fresh, otherwise one request for all readers (issue 1244). */
export const sharedZones = (client: QueryClient, api: string, token: string) =>
  loadShared(client, ZONES_KEY, REFERENCE_STALE_TIME, () => loadZones(api, token));

/** The locations of the account: the shared copy while it is fresh, otherwise one request for all readers. */
export const sharedLocations = (client: QueryClient, api: string, token: string) =>
  loadShared(client, LOCATIONS_KEY, REFERENCE_STALE_TIME, () => loadLocations(api, token));

/** After a write outside the light page that changes locations or zones: every copy is asked again. */
export const refreshLight = (client: QueryClient) =>
  client.invalidateQueries({ queryKey: LIGHT_KEY });
