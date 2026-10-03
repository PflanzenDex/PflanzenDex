import type { Species, SpeciesHit } from "@pflanzendex/core";
import { call, createWrite, type Response } from "../kernel";

type FetchFn = typeof fetch;

/** Searches species the account may see (approved and own proposals); an empty text lists all. */
export async function searchSpecies(
  api: string,
  token: string,
  text: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<readonly SpeciesHit[]>> {
  const r = await call<{ species: SpeciesHit[] }>(
    fetchFn,
    `${api}/species?q=${encodeURIComponent(text)}`,
    token,
  );
  return r.ok ? { ok: true, value: r.value.species } : r;
}

export const loadSpecies = (
  api: string,
  token: string,
  id: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<Species>> =>
  call<Species>(fetchFn, `${api}/species/${encodeURIComponent(id)}`, token);

/** Creates the proposal; the repeat-guard key is created per call. */
export async function propose(
  api: string,
  token: string,
  input: Record<string, unknown>,
  fetchFn: FetchFn = fetch,
): Promise<Response<Species>> {
  const r = await createWrite(api, token, fetchFn)("POST", "/species", input);
  return r.ok ? { ok: true, value: r.value as Species } : r;
}
