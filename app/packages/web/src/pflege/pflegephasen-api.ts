import type { PhasenZeile } from "@pflanzendex/core";
import { aufruf, type Antwort } from "../kern";

type Abruf = typeof fetch;

/**
 * Lädt die Pflegephasen des angemeldeten Kontos (US-PHA-01). Die Zeitzone des Geräts bestimmt „heute“ (NFR-08); das
 * Profil kennt noch keine (US-ACC-02).
 */
export async function ladePflegephasen(
  api: string,
  token: string,
  abruf: Abruf = fetch,
): Promise<Antwort<readonly PhasenZeile[]>> {
  const zeitzone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const r = await aufruf<{ phasen: PhasenZeile[] }>(
    abruf,
    `${api}/pflegephasen?zeitzone=${encodeURIComponent(zeitzone)}`,
    token,
  );
  return r.ok ? { ok: true, wert: r.wert.phasen } : r;
}
