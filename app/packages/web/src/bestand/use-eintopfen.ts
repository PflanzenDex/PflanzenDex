import { useCallback, useState } from "react";
import type { ApiFehler } from "../kern";
import { topfeEin } from "./exemplare-api";
import { ANMELDEN, type Token } from "./use-bestand";

/**
 * Eingetopft (US-BES-04): nach Erfolg lädt die Seite neu (`danach`), und die Meldung sagt, was sich geändert hat
 * (P-09); ein Fehler bleibt sichtbar (P-10).
 */
export function useEintopfen(api: string, token: Token, danach: () => void) {
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<ApiFehler | null>(null);

  const eintopfen = useCallback(
    async (e: { id: string; name: string }) => {
      const t = await token();
      const r = t ? await topfeEin(api, t, e.id) : { ok: false as const, fehler: ANMELDEN };
      setFehler(r.ok ? null : r.fehler);
      if (!r.ok) return setMeldung(null);
      setMeldung(
        `„${e.name}“ ist eingetopft und eine Pflanze. Ab jetzt gilt die Lichtzone seines Standorts oder der Art.`,
      );
      danach();
    },
    [api, token, danach],
  );

  return { meldung, fehler, eintopfen, setMeldung };
}
