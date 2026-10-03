type Abruf = typeof fetch;

/** Fehler der API mit stabilem Code (FR-QG-11); `D` ist die Form optionaler Zusatzdaten des Fehlers. */
export interface ApiFehler<D = unknown> {
  code: string;
  text: string;
  details?: { feld: string; code: string }[];
  daten?: D[];
}

export type Antwort<T, D = unknown> = { ok: true; wert: T } | { ok: false; fehler: ApiFehler<D> };

export type Schreiben<D = unknown> = (
  methode: "POST" | "PUT" | "DELETE",
  pfad: string,
  body?: unknown,
) => Promise<Antwort<unknown, D>>;

const NETZ_FEHLER: ApiFehler<never> = {
  code: "netz.nicht_erreichbar",
  text: "Der Server ist gerade nicht erreichbar. Bitte versuche es gleich noch einmal.",
};

export async function aufruf<T, D = unknown>(
  abruf: Abruf,
  url: string,
  token: string,
  init: { method?: string; body?: unknown; schluessel?: string } = {},
): Promise<Antwort<T, D>> {
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
    const body = (await res.json().catch(() => ({}))) as { fehler?: ApiFehler<D> };
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

/** Schreibzugriffe tragen je Aufruf einen frischen Wiederholungsschutz-Schlüssel (`Idempotency-Key`). */
export const erzeugeSchreiben =
  <D = unknown>(api: string, token: string, abruf: Abruf = fetch): Schreiben<D> =>
  (methode, pfad, body) =>
    aufruf<unknown, D>(abruf, `${api}${pfad}`, token, {
      method: methode,
      body,
      schluessel: crypto.randomUUID(),
    });
