import { useCallback, useEffect, useState } from "react";
import type { Species, SpeciesHit } from "@pflanzendex/core";
import { SIGN_IN, useInvalidate, useRequest, type ApiError, type Request } from "../kernel";
import { loadSpecies, propose, searchSpecies } from "./species-api";

type Token = () => Promise<string | undefined>;
export const SEARCH_KEY = ["catalog", "search"] as const;

/** The text after a short pause, so typing does not send a request per letter. */
function useDebounced(text: string, ms: number): string {
  const [settled, setSettled] = useState(text);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(text), text ? ms : 0);
    return () => clearTimeout(timer);
  }, [text, ms]);
  return settled;
}

/** Searches after a short pause after typing; the result stays until the next one is there (cached per text). */
export function useSearch(api: string, token: Token, searchText: string) {
  const term = useDebounced(searchText, 250);
  const key = [...SEARCH_KEY, term];
  const load = useCallback((t: string) => searchSpecies(api, t, term), [api, term]);
  const r = useRequest<readonly SpeciesHit[]>({
    queryKey: key,
    token,
    load,
    keepPrevious: true,
  });
  return {
    hit: r.value ?? [],
    loading: r.status === "pending" || term !== searchText,
    error: r.error ?? null,
    offline: r.offline,
    retry: r.retry,
  };
}

/** Loads the profile of a species once one is chosen; an error (also "not visible") is shown, never swallowed. */
export function useProfile(api: string, token: Token, id: string | null): Request<Species> {
  const load = useCallback((t: string) => loadSpecies(api, t, id ?? ""), [api, id]);
  return useRequest({ queryKey: ["catalog", "species", id], token, load, enabled: id !== null });
}

/** Sends the proposal of a species; the search forgets its cached hits and `onSaved` gets the new id (US-BES-01). */
export function useSend(api: string, token: Token, onSaved: (id: string) => void) {
  const searchChanged = useInvalidate(SEARCH_KEY);
  return async (input: Record<string, unknown>): Promise<ApiError | null> => {
    const t = await token();
    const r = t ? await propose(api, t, input) : { ok: false as const, error: SIGN_IN };
    if (!r.ok) return r.error;
    searchChanged();
    onSaved(r.value.id);
    return null;
  };
}

/** The species whose profile shows: starts with the one of the address and follows it when it changes (US-POK-09). */
export function useOpenId(openId: string | null | undefined) {
  const state = useState<string | null>(openId ?? null);
  const set = state[1];
  useEffect(() => {
    if (openId) set(openId);
  }, [openId, set]);
  return state;
}
