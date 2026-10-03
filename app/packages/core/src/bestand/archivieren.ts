import {
  definiereOperation,
  type Ergebnis,
  fehler,
  fehlgeschlagen,
  kennungFeld,
  objekt,
  textFeld,
  zeitzoneFeld,
} from "../kern";
import { EXEMPLAR_GRENZEN } from "./typen";
import type { ExemplarSpeicher, ExemplarZeile } from "./typen";

export interface ArchivierenAbhaengigkeiten {
  readonly exemplare: ExemplarSpeicher;
  /** Die Uhr kommt von außen, damit „heute“ prüfbar ist (NFR-08). */
  readonly uhr: () => Date;
}

const schema = objekt({
  exemplarId: kennungFeld("exemplarId"),
  zeitzone: zeitzoneFeld("zeitzone"),
  grund: textFeld("grund", EXEMPLAR_GRENZEN.archivGrund),
});

// Skelett für den roten Nachweis (P-06): Eingabe wird geprüft, das Verhalten fehlt noch.
export const exemplarArchivieren = (deps: ArchivierenAbhaengigkeiten) =>
  definiereOperation({
    name: "exemplar.archivieren",
    schema,
    ausfuehren: async (): Promise<Ergebnis<ExemplarZeile>> => {
      void deps;
      return fehlgeschlagen(fehler("system.unerwartet"));
    },
  });

const schemaWiederherstellen = objekt({ exemplarId: kennungFeld("exemplarId") });

export const exemplarWiederherstellen = (deps: Pick<ArchivierenAbhaengigkeiten, "exemplare">) =>
  definiereOperation({
    name: "exemplar.wiederherstellen",
    schema: schemaWiederherstellen,
    ausfuehren: async (): Promise<Ergebnis<ExemplarZeile>> => {
      void deps;
      return fehlgeschlagen(fehler("system.unerwartet"));
    },
  });
