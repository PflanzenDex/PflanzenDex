import type { ArchivEintrag, ExemplarZeile } from "@pflanzendex/core";
import { aufruf, erzeugeSchreiben, type Antwort } from "../kern";

type Abruf = typeof fetch;

/** Lädt die archivierten Exemplare des Kontos (US-BES-07). */
export async function ladeArchiv(
  api: string,
  token: string,
  abruf: Abruf = fetch,
): Promise<Antwort<readonly ArchivEintrag[]>> {
  const r = await aufruf<{ archiv: ArchivEintrag[] }>(abruf, `${api}/exemplare/archiv`, token);
  return r.ok ? { ok: true, wert: r.wert.archiv } : r;
}

/**
 * Archiviert ein Exemplar mit Grund. Die Zeitzone des Geräts bestimmt „heute“ für Archiviert_Am (NFR-08); das Profil
 * kennt noch keine (US-ACC-02). Der Wiederholungsschutz-Schlüssel entsteht je Aufruf.
 */
export async function archiviere(
  api: string,
  token: string,
  eingabe: { id: string; grund: string },
  abruf: Abruf = fetch,
): Promise<Antwort<ExemplarZeile>> {
  const zeitzone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const r = await erzeugeSchreiben(api, token, abruf)(
    "POST",
    `/exemplare/${encodeURIComponent(eingabe.id)}/archivieren`,
    { grund: eingabe.grund, zeitzone },
  );
  return r.ok ? { ok: true, wert: r.wert as ExemplarZeile } : r;
}

/** Stellt ein archiviertes Exemplar wieder her. */
export async function stelleWiederHer(
  api: string,
  token: string,
  id: string,
  abruf: Abruf = fetch,
): Promise<Antwort<ExemplarZeile>> {
  const r = await erzeugeSchreiben(api, token, abruf)(
    "POST",
    `/exemplare/${encodeURIComponent(id)}/wiederherstellen`,
    {},
  );
  return r.ok ? { ok: true, wert: r.wert as ExemplarZeile } : r;
}
