import {
  definiereOperation,
  fehler,
  fehlgeschlagen,
  heuteLokal,
  kennungFeld,
  objekt,
  ok,
  textFeld,
  zeitzoneFeld,
} from "../kern";
import { EXEMPLAR_GRENZEN } from "./typen";
import type { ExemplarSpeicher } from "./typen";

export interface ArchivierenAbhaengigkeiten {
  readonly exemplare: ExemplarSpeicher;
  /** Die Uhr kommt von außen, damit „heute“ prüfbar ist (NFR-08). */
  readonly uhr: () => Date;
}

// Die Zeitzone schickt vorerst das Gerät mit (das Profil kennt noch keine, US-ACC-02); sie bestimmt „heute“.
const schema = objekt({
  exemplarId: kennungFeld("exemplarId"),
  zeitzone: zeitzoneFeld("zeitzone"),
  grund: textFeld("grund", EXEMPLAR_GRENZEN.archivGrund),
});

const schemaWiederherstellen = objekt({ exemplarId: kennungFeld("exemplarId") });

const FEHLER = {
  nicht_gefunden: "exemplar.nicht_gefunden",
  bereits_archiviert: "exemplar.bereits_archiviert",
  nicht_archiviert: "exemplar.nicht_archiviert",
} as const;

/**
 * Archiviert ein Exemplar (US-BES-07): Status `archiviert`, Datum (lokales Kalenderdatum in der Zeitzone des Nutzers,
 * NFR-08) und Grund, in einer Anweisung. Die Historie bleibt, das Exemplar fehlt nur in Listen und Auswertungen. Ein
 * schon archiviertes Exemplar behält Datum und Grund der ersten Archivierung (P-10); ein fremdes oder unbekanntes
 * sieht gleich aus: `exemplar.nicht_gefunden` (P-04).
 */
export const exemplarArchivieren = (deps: ArchivierenAbhaengigkeiten) =>
  definiereOperation({
    name: "exemplar.archivieren",
    schema,
    ausfuehren: async ({ nutzerId }, eingabe) => {
      const heute = heuteLokal(deps.uhr(), eingabe.zeitzone);
      const r = await deps.exemplare.archivieren(
        nutzerId,
        eingabe.exemplarId,
        eingabe.grund,
        heute,
      );
      return typeof r === "string" ? fehlgeschlagen(fehler(FEHLER[r])) : ok(r);
    },
  });

/**
 * Stellt ein archiviertes Exemplar wieder her (US-BES-07): es hat danach den Status von vor der Archivierung, Datum
 * und Grund sind gelöscht. Sein Name war die ganze Zeit belegt, es kann also nie mit einem neuen kollidieren.
 */
export const exemplarWiederherstellen = (deps: Pick<ArchivierenAbhaengigkeiten, "exemplare">) =>
  definiereOperation({
    name: "exemplar.wiederherstellen",
    schema: schemaWiederherstellen,
    ausfuehren: async ({ nutzerId }, eingabe) => {
      const r = await deps.exemplare.wiederherstellen(nutzerId, eingabe.exemplarId);
      return typeof r === "string" ? fehlgeschlagen(fehler(FEHLER[r])) : ok(r);
    },
  });
