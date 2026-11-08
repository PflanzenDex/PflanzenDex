import { useCallback, useState } from "react";
import type { ApiError } from "../../../shared/data";
import { texts } from "@/shared/lib/text-rules/texts";
import type { Say } from "@/shared/patterns/states/toast/toast-provider/toast-provider";
import { markSpecimen } from "../../specimens/model/specimens-api";
import { SIGN_IN, type Token } from "../../specimens/hooks/use-collection";
import table from "./marker.de.json";

const t = texts(table);

/** The specimen whose marker is being changed (US-BES-03). */
export type MarkTarget = {
  id: string;
  name: string;
  marker: string | null;
  speciesName: string | null;
};

/**
 * State and action for giving a specimen a marker (US-BES-03). After success the page reloads (`after`) and a toast
 * names the old and the new name (P-09); an error stays in the form (P-10).
 */
export function useMarker(api: string, token: Token, after: () => void, say: Say) {
  const [open, setOpen] = useState<MarkTarget | null>(null);

  const send = useCallback(
    async (marker: string): Promise<ApiError | null> => {
      const tok = await token();
      if (!tok || !open) return SIGN_IN;
      const r = await markSpecimen(api, tok, { id: open.id, marker });
      if (!r.ok) return r.error;
      say(t("renamed", { name: open.name, marker: r.value.name }));
      setOpen(null);
      after();
      return null;
    },
    [api, token, open, after, say],
  );

  return { open, send, setOpen };
}
