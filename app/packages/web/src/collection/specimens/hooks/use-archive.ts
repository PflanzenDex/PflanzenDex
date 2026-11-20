import { useRepeatKey } from "@/shared/data";
import { useCallback, useState } from "react";
import type { ApiError } from "../../../shared/data";
import { refusalText } from "@/shared/lib/error-text";
import { texts } from "@/shared/lib/text-rules/texts";
import { useToast, type Say } from "@/shared/patterns/states/toast/toast-provider/toast-provider";
import { archiveSpecimen, restoreSpecimen } from "../../archived/archived-api";
import { SIGN_IN, type Token } from "./use-collection";
import table from "../../archived/archived.de.json";

const t = texts(table);

type SpecimenName = { id: string; name: string };

/**
 * State and actions for archiving and restoring (US-BES-07). After success the page reloads (`after`) and a toast says
 * where the specimen is now (P-09). Both results leave the row off its list, so the toast stays until the in-place row of
 * FX-09 (SG-FEED-03; US-QS-32). A refused restore is a toast too (P-10); a refused archive stays in its form.
 */
export function useArchive(api: string, token: Token, after: () => void, say: Say) {
  const [open, setOpen] = useState<SpecimenName | null>(null);
  const keys = useRepeatKey();
  const toast = useToast();

  const archive = useCallback(
    async (reason: string): Promise<ApiError | null> => {
      const tok = await token();
      if (!tok || !open) return SIGN_IN;
      const r = await keys.run(
        (key) => archiveSpecimen(api, tok, { id: open.id, reason }, { key }),
        `${open.id}:archive`,
      );
      if (!r.ok) return r.error;
      // The row leaves the list: visible result until the in-place row of FX-09 (SG-FEED-03).
      toast.show({ message: t("archived", { name: open.name }) });
      setOpen(null);
      after();
      return null;
    },
    [api, token, open, after, toast],
  );

  const restore = useCallback(
    async (e: SpecimenName) => {
      const tok = await token();
      const r = tok
        ? await keys.run((key) => restoreSpecimen(api, tok, e.id, { key }), `${e.id}:restore`)
        : { ok: false as const, error: SIGN_IN };
      if (!r.ok) say(refusalText(r.error), "error");
      // The row leaves the archive: visible result until the in-place row of FX-09 (SG-FEED-03).
      else toast.show({ message: t("restored", { name: e.name }) });
      after();
    },
    [api, token, after, say, toast],
  );

  return { open, archive, restore, setOpen };
}
