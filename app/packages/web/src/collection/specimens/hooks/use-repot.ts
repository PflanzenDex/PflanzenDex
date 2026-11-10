import { useCallback, useState } from "react";
import type { SpecimenCard } from "@pflanzendex/core";
import { texts } from "@/shared/lib/text-rules/texts";
import type { ApiError } from "../../../shared/data";
import type { Say } from "@/shared/patterns/states/toast/toast-provider/toast-provider";
import { repotSpecimen } from "../model/specimens-api";
import { SIGN_IN, type Token } from "./use-collection";
import table from "../../markers/repot/repot.de.json";

const t = texts(table);

/** The status of a plant, compared as a value (FR-QG-12). */
const PLANT_STATUS = "plant" as const;

/** The cutting that is potted or the plant that is repotted (US-BES-04, US-BES-19). */
export type RepotTarget = { id: string; name: string; status: SpecimenCard["status"] };

/**
 * State and action for potting a cutting or repotting a plant (US-BES-04, US-BES-19). The form asks for the day first:
 * nothing is written before "Speichern" (issue 1028). After success the page reloads (`after`) and the message says what
 * changed (P-09); a refusal stays in the form (P-10). `access` is what the form reads the plant's plan with.
 */
export function useRepot(api: string, token: Token, after: () => void, say: Say) {
  const [open, setOpen] = useState<RepotTarget | null>(null);

  const send = useCallback(
    async (date: string, potId?: string): Promise<ApiError | null> => {
      const tok = await token();
      if (!tok || !open) return SIGN_IN;
      const r = await repotSpecimen(api, tok, {
        id: open.id,
        date,
        ...(potId === undefined ? {} : { potId }),
      });
      if (!r.ok) return r.error;
      say(t(open.status === PLANT_STATUS ? "done.plant" : "done.cutting", { name: open.name }));
      setOpen(null);
      after();
      return null;
    },
    [api, token, open, after, say],
  );

  return { open, send, setOpen, access: { api, token } };
}
