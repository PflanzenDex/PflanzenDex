import { useCallback, useState } from "react";
import type { ApiError } from "../kernel";
import { repotSpecimen } from "./specimens-api";
import { SIGN_IN, type Token } from "./use-collection";

/**
 * Repotted (US-BES-04): after success the page reloads (`after`) and the message says what changed (P-09); an error
 * stays visible (P-10).
 */
export function useRepot(api: string, token: Token, after: () => void) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const repot = useCallback(
    async (e: { id: string; name: string }) => {
      const t = await token();
      const r = t ? await repotSpecimen(api, t, e.id) : { ok: false as const, error: SIGN_IN };
      setError(r.ok ? null : r.error);
      if (!r.ok) return setMessage(null);
      setMessage(
        `„${e.name}“ ist eingetopft und eine Pflanze. Ab jetzt gilt die Lichtzone seines Standorts oder der Art.`,
      );
      after();
    },
    [api, token, after],
  );

  return { message, error, repot, setMessage };
}
