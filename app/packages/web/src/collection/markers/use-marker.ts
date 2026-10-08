import { useCallback, useState } from "react";
import type { ApiError } from "../../kernel";
import { markSpecimen } from "../specimens/model/specimens-api";
import { SIGN_IN, type Token } from "../specimens/hooks/use-collection";

/** The specimen whose marker is being changed (US-BES-03). */
export type MarkTarget = {
  id: string;
  name: string;
  marker: string | null;
  speciesName: string | null;
};

/**
 * State and action for giving a specimen a marker (US-BES-03). After success the page reloads (`after`) and the message
 * names the old and the new name (P-09); an error stays in the form (P-10).
 */
export function useMarker(api: string, token: Token, after: () => void) {
  const [open, setOpen] = useState<MarkTarget | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const send = useCallback(
    async (marker: string): Promise<ApiError | null> => {
      const t = await token();
      if (!t || !open) return SIGN_IN;
      const r = await markSpecimen(api, t, { id: open.id, marker });
      if (!r.ok) return r.error;
      setMessage(
        `„${open.name}“ heißt jetzt „${r.value.name}“. Die Historie bleibt beim Exemplar.`,
      );
      setOpen(null);
      after();
      return null;
    },
    [api, token, open, after],
  );

  return { open, message, send, setOpen, setMessage };
}
