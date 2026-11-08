import { useCallback, useState } from "react";
import type { ApiError } from "../../../shared/data";
import { refusalText } from "@/shared/lib/error-text";
import { texts } from "@/shared/lib/text-rules/texts";
import type { Say } from "@/shared/patterns/states/toast/toast-provider/toast-provider";
import { archiveSpecimen, restoreSpecimen } from "../../archived/archived-api";
import { SIGN_IN, type Token } from "./use-collection";
import table from "./hooks.de.json";

const t = texts(table);

type SpecimenName = { id: string; name: string };

/**
 * State and actions for archiving and restoring (US-BES-07). After success the page reloads (`after`) and a toast says
 * where the specimen is now (P-09). A refused restore is a toast too (P-10); a refused archive stays in its form.
 */
export function useArchive(api: string, token: Token, after: () => void, say: Say) {
  const [open, setOpen] = useState<SpecimenName | null>(null);

  const archive = useCallback(
    async (reason: string): Promise<ApiError | null> => {
      const tok = await token();
      if (!tok || !open) return SIGN_IN;
      const r = await archiveSpecimen(api, tok, { id: open.id, reason });
      if (!r.ok) return r.error;
      say(t("archived", { name: open.name }));
      setOpen(null);
      after();
      return null;
    },
    [api, token, open, after, say],
  );

  const restore = useCallback(
    async (e: SpecimenName) => {
      const tok = await token();
      const r = tok
        ? await restoreSpecimen(api, tok, e.id)
        : { ok: false as const, error: SIGN_IN };
      if (!r.ok) say(refusalText(r.error), "error");
      else say(t("restored", { name: e.name }));
      after();
    },
    [api, token, after, say],
  );

  return { open, archive, restore, setOpen };
}
