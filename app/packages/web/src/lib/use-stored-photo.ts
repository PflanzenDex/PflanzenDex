import { useEffect, useState } from "react";
import type { ApiError } from "../kernel";

/** Where to and as whom a private photo is fetched (P-05). */
export interface PhotoAccess {
  readonly api: string;
  readonly token: () => Promise<string | undefined>;
}

/** An object URL once loaded, an error with its code if not, `null` while loading. */
type Loaded = string | ApiError | null;

const FAILED: ApiError = { code: "network.not_reachable", text: "Nicht erreichbar." };

/**
 * Loads a private photo from the API path with the token (P-05, US-WAC-05): the bytes never sit behind a public
 * link. The object URL is released when the component goes away. `undefined` path: nothing to load.
 */
export function useStoredPhoto({ api, token }: PhotoAccess, path: string | undefined): Loaded {
  const [state, setState] = useState<Loaded>(null);
  useEffect(() => {
    if (!path) return;
    let url = "";
    void (async () => {
      try {
        const res = await fetch(api + path, {
          headers: { Authorization: `Bearer ${await token()}` },
        });
        const body = res.ok ? null : ((await res.json()) as { error?: ApiError });
        setState(body ? (body.error ?? FAILED) : (url = URL.createObjectURL(await res.blob())));
      } catch {
        setState(FAILED);
      }
    })();
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [api, token, path]);
  return state;
}
