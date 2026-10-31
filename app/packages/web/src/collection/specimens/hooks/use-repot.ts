import { useCallback, useState } from "react";
import type { ApiError } from "../../../kernel";
import { repotSpecimen } from "../model/specimens-api";
import { SIGN_IN, type Token } from "./use-collection";

/** The cutting that is being potted (US-BES-04). */
export type RepotTarget = { id: string; name: string };

/**
 * State and action for potting a cutting (US-BES-04). The form asks for the day first: nothing is written before
 * "Speichern" (issue 1028). After success the page reloads (`after`) and the message says what changed (P-09); a
 * refusal stays in the form (P-10).
 */
export function useRepot(api: string, token: Token, after: () => void) {
  const [open, setOpen] = useState<RepotTarget | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const send = useCallback(
    async (date: string): Promise<ApiError | null> => {
      const t = await token();
      if (!t || !open) return SIGN_IN;
      const r = await repotSpecimen(api, t, { id: open.id, date });
      if (!r.ok) return r.error;
      setMessage(
        `„${open.name}“ ist eingetopft und eine Pflanze. Ab jetzt gilt die Lichtzone ihres Standorts oder der Art.`,
      );
      setOpen(null);
      after();
      return null;
    },
    [api, token, open, after],
  );

  return { open, message, send, setOpen, setMessage };
}
