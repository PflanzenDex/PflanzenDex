import { useCallback, useEffect, useState } from "react";
import type { Species, SpeciesHit } from "@pflanzendex/core";
import type { ApiError } from "../kernel";
import { loadSpecies, searchSpecies } from "./species-api";

type Token = () => Promise<string | undefined>;
export const SIGN_IN: ApiError = {
  code: "access.not_signed_in",
  text: "Bitte melde dich neu an.",
};
export type Profile =
  { kind: "loading" } | { kind: "error"; error: ApiError } | { kind: "da"; value: Species };

/** Searches after a short pause after typing; `reload` changes when the list must be current. */
export function useSearch(api: string, token: Token, searchText: string, reload: string) {
  const [hit, setHit] = useState<readonly SpeciesHit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  useEffect(() => {
    let current = true;
    setLoading(true);
    const run = async () => {
      const t = await token();
      const r = t
        ? await searchSpecies(api, t, searchText)
        : { ok: false as const, error: SIGN_IN };
      if (!current) return;
      if (r.ok) setHit(r.value);
      setError(r.ok ? null : r.error);
      setLoading(false);
    };
    const timer = setTimeout(() => void run(), searchText ? 250 : 0);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [api, token, searchText, reload]);
  return { hit, loading, error };
}

/** Loads the profile of a species; an error (also "not visible") is shown, never swallowed. */
export function useProfile(api: string, token: Token) {
  const [profile, setProfile] = useState<Profile>({ kind: "loading" });
  const load = useCallback(
    async (id: string) => {
      setProfile({ kind: "loading" });
      const t = await token();
      const r = t ? await loadSpecies(api, t, id) : { ok: false as const, error: SIGN_IN };
      setProfile(r.ok ? { kind: "da", value: r.value } : { kind: "error", error: r.error });
    },
    [api, token],
  );
  return { profile, load };
}
