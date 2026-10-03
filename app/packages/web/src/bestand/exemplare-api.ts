import type { Exemplar } from "@pflanzendex/core";
import { aufruf, erzeugeSchreiben, type Antwort } from "../kern";

type Abruf = typeof fetch;

/** Lädt die Exemplare des angemeldeten Kontos. */
export async function ladeExemplare(
  api: string,
  token: string,
  abruf: Abruf = fetch,
): Promise<Antwort<readonly Exemplar[]>> {
  const r = await aufruf<{ exemplare: Exemplar[] }>(abruf, `${api}/exemplare`, token);
  return r.ok ? { ok: true, wert: r.wert.exemplare } : r;
}

/**
 * Legt ein Exemplar an. Die Zeitzone des Geräts bestimmt „heute“ für Gefangen_Am (NFR-08); das Profil kennt noch keine
 * (US-ACC-02). Der Wiederholungsschutz-Schlüssel entsteht je Aufruf.
 */
export async function legeExemplarAn(
  api: string,
  token: string,
  eingabe: { artId: string; kennzeichen?: string; standortId?: string },
  abruf: Abruf = fetch,
): Promise<Antwort<Exemplar>> {
  const zeitzone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const r = await erzeugeSchreiben(api, token, abruf)("POST", "/exemplare", {
    ...eingabe,
    zeitzone,
  });
  return r.ok ? { ok: true, wert: r.wert as Exemplar } : r;
}
