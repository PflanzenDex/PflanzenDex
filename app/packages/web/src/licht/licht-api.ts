import type { Hinweis, LichtStandort, Lichtzone, ZonenNutzer } from "@pflanzendex/core";

import {
  aufruf,
  erzeugeSchreiben as erzeugeKern,
  type Antwort as KernAntwort,
  type ApiFehler as KernApiFehler,
  type Schreiben as KernSchreiben,
} from "../kern";

export type { Hinweis, LichtStandort, Lichtzone, ZonenNutzer };

type Abruf = typeof fetch;

/** Bei `lichtzone.in_benutzung` trägt der Fehler die Nutzer der Zone als `daten`. */
export type ApiFehler = KernApiFehler<ZonenNutzer>;
export type Antwort<T> = KernAntwort<T, ZonenNutzer>;
export type Schreiben = KernSchreiben<ZonenNutzer>;

export interface LichtDaten {
  zonen: readonly Lichtzone[];
  standorte: readonly LichtStandort[];
  hinweise: readonly Hinweis[];
}

/** Lädt Zonen, Standorte und Hinweise; scheitert eines, scheitert das Laden als Ganzes (nichts halb anzeigen). */
export async function ladeLicht(
  api: string,
  token: string,
  abruf: Abruf = fetch,
): Promise<Antwort<LichtDaten>> {
  const [z, s, h] = await Promise.all([
    aufruf<{ zonen: Lichtzone[] }, ZonenNutzer>(abruf, `${api}/lichtzonen`, token),
    aufruf<{ standorte: LichtStandort[] }, ZonenNutzer>(abruf, `${api}/standorte`, token),
    aufruf<{ hinweise: Hinweis[] }, ZonenNutzer>(abruf, `${api}/hinweise`, token),
  ]);
  if (!z.ok) return z;
  if (!s.ok) return s;
  if (!h.ok) return h;
  return {
    ok: true,
    wert: { zonen: z.wert.zonen, standorte: s.wert.standorte, hinweise: h.wert.hinweise },
  };
}

export const erzeugeSchreiben = (api: string, token: string, abruf: Abruf = fetch): Schreiben =>
  erzeugeKern<ZonenNutzer>(api, token, abruf);
