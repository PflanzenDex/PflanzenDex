import { useCallback, useState } from "react";
import type { ApiError } from "../../../kernel";
import { archiveSpecimen, restoreSpecimen } from "../../archived/archived-api";
import { SIGN_IN, type Token } from "./use-collection";

type SpecimenName = { id: string; name: string };

/**
 * State and actions for archiving and restoring (US-BES-07). After success the page reloads (`after`) and the message
 * says where the specimen is now (P-09); an error stays visible (P-10).
 */
export function useArchive(api: string, token: Token, after: () => void) {
  const [open, setOpen] = useState<SpecimenName | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const archive = useCallback(
    async (reason: string): Promise<ApiError | null> => {
      const t = await token();
      if (!t || !open) return SIGN_IN;
      const r = await archiveSpecimen(api, t, { id: open.id, reason });
      if (!r.ok) return r.error;
      setMessage(
        `„${open.name}“ ist archiviert. Du findest es im Archiv und kannst es dort wiederherstellen.`,
      );
      setOpen(null);
      after();
      return null;
    },
    [api, token, open, after],
  );

  const restore = useCallback(
    async (e: SpecimenName) => {
      const t = await token();
      const r = t ? await restoreSpecimen(api, t, e.id) : { ok: false as const, error: SIGN_IN };
      setError(r.ok ? null : r.error);
      if (!r.ok) return;
      setMessage(`„${e.name}“ ist wiederhergestellt und steht wieder im Bestand.`);
      after();
    },
    [api, token, after],
  );

  return { open, message, error, archive, restore, setOpen, setMessage };
}
