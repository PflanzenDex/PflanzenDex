import { definiereOperation, fehler, fehlgeschlagen, kennungFeld, objekt, ok } from "../kern";
import type { ExemplarSpeicher } from "./typen";

export interface EintopfenAbhaengigkeiten {
  readonly exemplare: ExemplarSpeicher;
}

const schema = objekt({ exemplarId: kennungFeld("exemplarId") });

const FEHLER = {
  nicht_gefunden: "exemplar.nicht_gefunden",
  kein_steckling: "exemplar.kein_steckling",
} as const;

/**
 * „Eingetopft“ (US-BES-04): aus dem Steckling wird eine Pflanze. Der Status ist der einzige gespeicherte Teil der
 * Stecklings-Zuordnung; die Lichtzone ist abgeleitet (`stecklingslicht`), also gilt ab jetzt wieder die Zone des
 * Standorts oder der Art, ohne dass ein Override gelöscht werden müsste. Alles andere (Pflanze, archiviert) bleibt
 * unverändert und meldet `exemplar.kein_steckling`; ein fremdes oder unbekanntes Exemplar sieht gleich aus: 404 (P-04).
 */
export const exemplarEintopfen = (deps: EintopfenAbhaengigkeiten) =>
  definiereOperation({
    name: "exemplar.eintopfen",
    schema,
    ausfuehren: async ({ nutzerId }, eingabe) => {
      const r = await deps.exemplare.eintopfen(nutzerId, eingabe.exemplarId);
      return typeof r === "string" ? fehlgeschlagen(fehler(FEHLER[r])) : ok(r);
    },
  });
