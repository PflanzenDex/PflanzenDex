import type { MessAnsicht, MessungZeile, Qualitaet } from "@pflanzendex/core";
import { aufruf, erzeugeSchreiben, type Antwort } from "../kern";

type Abruf = typeof fetch;

export interface MessungEingabe {
  wert: number;
  /** `JJJJ-MM-TT`; ohne Angabe gilt heute in der Zeitzone des Geräts. */
  datum?: string;
  qualitaet: Qualitaet;
  notiz?: string;
}

/** Lädt die Ansicht „Messen“ eines Exemplars. */
export function ladeMessAnsicht(
  api: string,
  token: string,
  exemplarId: string,
  abruf: Abruf = fetch,
): Promise<Antwort<MessAnsicht>> {
  return aufruf<MessAnsicht>(
    abruf,
    `${api}/exemplare/${encodeURIComponent(exemplarId)}/messungen`,
    token,
  );
}

/** Wohin und als wer: Adresse der API, Token und (für Tests) die Abruffunktion. */
export interface Zugang {
  api: string;
  token: string;
  abruf?: Abruf;
}

/**
 * Erfasst eine Messung. Die Zeitzone des Geräts bestimmt „heute“ (NFR-08); das Profil kennt noch keine (US-ACC-02).
 * Der Wiederholungsschutz-Schlüssel entsteht je Aufruf; ein erneutes Senden desselben Aufrufs schreibt nicht doppelt.
 */
export async function erfasseMessung(
  zugang: Zugang,
  exemplarId: string,
  eingabe: MessungEingabe,
): Promise<Antwort<MessungZeile>> {
  const zeitzone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const r = await erzeugeSchreiben(zugang.api, zugang.token, zugang.abruf ?? fetch)(
    "POST",
    `/exemplare/${encodeURIComponent(exemplarId)}/messungen`,
    { ...eingabe, zeitzone },
  );
  return r.ok ? { ok: true, wert: r.wert as MessungZeile } : r;
}
