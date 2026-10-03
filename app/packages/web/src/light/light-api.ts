import type { Derivation, Hint, LightLocation, LightZone, ZoneUser } from "@pflanzendex/core";

import {
  call,
  createWrite as createKernel,
  type Response as KernelResponse,
  type ApiError as KernelApiError,
  type Write as KernelWrite,
} from "../kernel";

export type { Derivation, Hint, LightLocation, LightZone, ZoneUser };

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

/** Loads zones, locations and hints; if one fails, loading fails as a whole (show nothing half-way). */
export async function loadLight(
  api: string,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<LightData>> {
  const [z, s, h] = await Promise.all([
    call<{ zones: LightZone[] }, ZoneUser>(fetchFn, `${api}/light-zones`, token),
    call<{ locations: LightLocation[] }, ZoneUser>(fetchFn, `${api}/locations`, token),
    call<{ hints: Hint[] }, ZoneUser>(fetchFn, `${api}/hints`, token),
  ]);
  if (!z.ok) return z;
  if (!s.ok) return s;
  if (!h.ok) return h;
  return {
    ok: true,
    value: { zones: z.value.zones, locations: s.value.locations, hints: h.value.hints },
  };
}

/** Only the locations of the account, e.g. for selection in other modules (create specimen). */
export async function loadLocations(
  api: string,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<KernelResponse<readonly LightLocation[]>> {
  const r = await call<{ locations: LightLocation[] }>(fetchFn, `${api}/locations`, token);
  return r.ok ? { ok: true, value: r.value.locations } : r;
}

export const createWrite = (api: string, token: string, fetchFn: FetchFn = fetch): Write =>
  createKernel<ZoneUser>(api, token, fetchFn);

export interface DerivationRequest {
  lightDemandLux: number;
  standardLevel: number;
  softLeaf: boolean;
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
