import type { Species, SpeciesHit, SpeciesSearch } from "@pflanzendex/core";
import { call, type Response, type WriteOptions, writeFor } from "../shared/data";

type FetchFn = typeof fetch;

/**
 * The page of a search (FR-BES-24): the shown hits and whether more species match. Species the account may see
 * (approved and own proposals); an empty text lists all.
 */
export const searchSpeciesPage = (
  api: string,
  token: string,
  text: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<SpeciesSearch>> =>
  call<SpeciesSearch>(fetchFn, `${api}/species?q=${encodeURIComponent(text)}`, token);

/** The hits of a search only (the add-plant flow and the onboarding read no more). */
export async function searchSpecies(
  api: string,
  token: string,
  text: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<readonly SpeciesHit[]>> {
  const r = await searchSpeciesPage(api, token, text, fetchFn);
  return r.ok ? { ok: true, value: r.value.species } : r;
}

export const loadSpecies = (
  api: string,
  token: string,
  id: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<Species>> =>
  call<Species>(fetchFn, `${api}/species/${encodeURIComponent(id)}`, token);

/** Creates the proposal; the repeat-guard key is the action's (`options.key`), else made per call. */
export async function propose(
  api: string,
  token: string,
  input: Record<string, unknown>,
  options: WriteOptions = {},
): Promise<Response<Species>> {
  const r = await writeFor(api, token, options)("POST", "/species", input);
  return r.ok ? { ok: true, value: r.value as Species } : r;
}
