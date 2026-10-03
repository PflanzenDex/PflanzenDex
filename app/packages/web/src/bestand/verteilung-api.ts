import type { Verteilung } from "@pflanzendex/core";
import { aufruf, type Antwort } from "../kern";

/** Lädt die Verteilung der eigenen Exemplare auf die Lichtzonen (US-LIC-02); abgeleitet, nie gespeichert. */
export async function ladeVerteilung(
  api: string,
  token: string,
  abruf: typeof fetch = fetch,
): Promise<Antwort<Verteilung>> {
  const r = await aufruf<{ verteilung: Verteilung }>(abruf, `${api}/exemplare/verteilung`, token);
  return r.ok ? { ok: true, wert: r.wert.verteilung } : r;
}
