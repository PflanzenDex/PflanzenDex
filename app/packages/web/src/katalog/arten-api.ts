import type { Art, ArtTreffer } from "@pflanzendex/core";
import { aufruf, erzeugeSchreiben, type Antwort } from "../kern";

type Abruf = typeof fetch;

/** Sucht Arten, die das Konto sehen darf (freigegebene und eigene Vorschläge); leerer Text listet alle. */
export async function sucheArten(
  api: string,
  token: string,
  text: string,
  abruf: Abruf = fetch,
): Promise<Antwort<readonly ArtTreffer[]>> {
  const r = await aufruf<{ arten: ArtTreffer[] }>(
    abruf,
    `${api}/arten?q=${encodeURIComponent(text)}`,
    token,
  );
  return r.ok ? { ok: true, wert: r.wert.arten } : r;
}

export const ladeArt = (
  api: string,
  token: string,
  id: string,
  abruf: Abruf = fetch,
): Promise<Antwort<Art>> => aufruf<Art>(abruf, `${api}/arten/${encodeURIComponent(id)}`, token);

/** Legt den Vorschlag an; der Wiederholungsschutz-Schlüssel entsteht je Aufruf. */
export async function schlageVor(
  api: string,
  token: string,
  eingabe: Record<string, unknown>,
  abruf: Abruf = fetch,
): Promise<Antwort<Art>> {
  const r = await erzeugeSchreiben(api, token, abruf)("POST", "/arten", eingabe);
  return r.ok ? { ok: true, wert: r.wert as Art } : r;
}
