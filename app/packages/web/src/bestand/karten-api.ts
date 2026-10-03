import type { ExemplarKarte } from "@pflanzendex/core";
import { aufruf, type Antwort } from "../kern";

/** Lädt die Karten der eigenen Exemplare; die Zeitzone des Geräts bestimmt „heute“ für die Fälligkeit (NFR-08). */
export async function ladeKarten(
  api: string,
  token: string,
  abruf: typeof fetch = fetch,
): Promise<Antwort<readonly ExemplarKarte[]>> {
  const zeitzone = encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const r = await aufruf<{ karten: ExemplarKarte[] }>(
    abruf,
    `${api}/exemplare/karten?zeitzone=${zeitzone}`,
    token,
  );
  return r.ok ? { ok: true, wert: r.wert.karten } : r;
}
