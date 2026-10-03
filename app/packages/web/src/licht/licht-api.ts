import type { Hinweis, LichtStandort, Lichtzone, ZonenNutzer } from "@pflanzendex/core";

export type { Hinweis, LichtStandort, Lichtzone, ZonenNutzer };

type Abruf = typeof fetch;

export interface ApiFehler {
  code: string;
  text: string;
  details?: { feld: string; code: string }[];
  /** Bei `lichtzone.in_benutzung`: wer die Zone nutzt. */
  daten?: ZonenNutzer[];
}

export type Antwort<T> = { ok: true; wert: T } | { ok: false; fehler: ApiFehler };

export interface LichtDaten {
  zonen: readonly Lichtzone[];
  standorte: readonly LichtStandort[];
  hinweise: readonly Hinweis[];
}

const NETZ_FEHLER: ApiFehler = {
  code: "netz.nicht_erreichbar",
  text: "Der Server ist gerade nicht erreichbar. Bitte versuche es gleich noch einmal.",
};

export async function aufruf<T>(
  abruf: Abruf,
  url: string,
  token: string,
  init: { method?: string; body?: unknown; schluessel?: string } = {},
): Promise<Antwort<T>> {
  try {
    const res = await abruf(url, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(init.schluessel ? { "Idempotency-Key": init.schluessel } : {}),
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
    const body = (await res.json().catch(() => ({}))) as { fehler?: ApiFehler };
    if (res.ok) return { ok: true, wert: body as T };
    if (res.status === 401)
      return {
        ok: false,
        fehler: { code: "zugriff.nicht_angemeldet", text: "Bitte melde dich neu an." },
      };
    return { ok: false, fehler: body.fehler ?? NETZ_FEHLER };
  } catch {
    return { ok: false, fehler: NETZ_FEHLER };
  }
}

/** Lädt Zonen, Standorte und Hinweise; scheitert eines, scheitert das Laden als Ganzes (nichts halb anzeigen). */
export async function ladeLicht(
  api: string,
  token: string,
  abruf: Abruf = fetch,
): Promise<Antwort<LichtDaten>> {
  const [z, s, h] = await Promise.all([
    aufruf<{ zonen: Lichtzone[] }>(abruf, `${api}/lichtzonen`, token),
    aufruf<{ standorte: LichtStandort[] }>(abruf, `${api}/standorte`, token),
    aufruf<{ hinweise: Hinweis[] }>(abruf, `${api}/hinweise`, token),
  ]);
  if (!z.ok) return z;
  if (!s.ok) return s;
  if (!h.ok) return h;
  return {
    ok: true,
    wert: { zonen: z.wert.zonen, standorte: s.wert.standorte, hinweise: h.wert.hinweise },
  };
}

export type Schreiben = (
  methode: "POST" | "PUT" | "DELETE",
  pfad: string,
  body?: unknown,
) => Promise<Antwort<unknown>>;

/** Schreibzugriffe tragen je Aufruf einen frischen Wiederholungsschutz-Schlüssel (`Idempotency-Key`). */
export const erzeugeSchreiben =
  (api: string, token: string, abruf: Abruf = fetch): Schreiben =>
  (methode, pfad, body) =>
    aufruf(abruf, `${api}${pfad}`, token, {
      method: methode,
      body,
      schluessel: crypto.randomUUID(),
    });
