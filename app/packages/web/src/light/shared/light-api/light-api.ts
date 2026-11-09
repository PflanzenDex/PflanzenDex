import type {
  Derivation,
  Hint,
  LightLocation,
  LightOverview,
  LightOverviewRow,
  LightZone,
  ZoneUser,
} from "@pflanzendex/core";

import {
  call,
  createWrite as createKernel,
  type Response as KernelResponse,
  type ApiError as KernelApiError,
  type Write as KernelWrite,
} from "../../../shared/data";

export type {
  Derivation,
  Hint,
  LightLocation,
  LightOverview,
  LightOverviewRow,
  LightZone,
  ZoneUser,
};

type FetchFn = typeof fetch;

/** For `light_zone.in_use` the error carries the users of the zone as `data`. */
export type ApiError = KernelApiError<ZoneUser>;
export type Response<T> = KernelResponse<T, ZoneUser>;
export type Write = KernelWrite<ZoneUser>;

export interface LightData {
  zones: readonly LightZone[];
  locations: readonly LightLocation[];
  hints: readonly Hint[];
}

/** The hints of the account for the light page; only that page reads them, so they have no shared copy. */
export async function loadHints(
  api: string,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<readonly Hint[]>> {
  const r = await call<{ hints: Hint[] }, ZoneUser>(fetchFn, `${api}/hints`, token);
  return r.ok ? { ok: true, value: r.value.hints } : r;
}

/**
 * The locations of the account. Screens read them through the shared copy (`sharedLocations`, light-shared.ts); this
 * is the one request behind it.
 */
export async function loadLocations(
  api: string,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<readonly LightLocation[]>> {
  const r = await call<{ locations: LightLocation[] }, ZoneUser>(
    fetchFn,
    `${api}/locations`,
    token,
  );
  return r.ok ? { ok: true, value: r.value.locations } : r;
}

/** The zones of the account; screens read them through the shared copy (`sharedZones`, light-shared.ts). */
export async function loadZones(
  api: string,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<readonly LightZone[]>> {
  const r = await call<{ zones: LightZone[] }, ZoneUser>(fetchFn, `${api}/light-zones`, token);
  return r.ok ? { ok: true, value: r.value.zones } : r;
}

export const createWrite = (
  api: string,
  token: string,
  fetchFn: FetchFn = fetch,
  key?: string,
): Write => createKernel<ZoneUser>(api, token, fetchFn, key);

export interface DerivationRequest {
  lightDemandLux: number;
  standardLevel: number;
  softLeaf: boolean;
}

/** US-LIC-03: species by light hunger with position recommendations (derived, never stored). */
export async function loadLightOverview(
  api: string,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<LightOverview>> {
  return call<LightOverview, ZoneUser>(fetchFn, `${api}/specimens/light-overview`, token);
}

/** US-LIC-01: zone of the species, derived from the lux need according to the zones of the account (never stored). */
export async function loadDerivation(
  api: string,
  token: string,
  a: DerivationRequest,
  fetchFn: FetchFn = fetch,
): Promise<Response<Derivation>> {
  const q = new URLSearchParams({
    lightDemandLux: String(a.lightDemandLux),
    standardLevel: String(a.standardLevel),
    softLeaf: String(a.softLeaf),
  });
  return call<Derivation, ZoneUser>(fetchFn, `${api}/light-zones/derivation?${q}`, token);
}
