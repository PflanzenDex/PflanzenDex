import { definiereOperation } from "../operation";
import { fehler } from "../fehler";
import { fehlgeschlagen, ok } from "../ergebnis";
import { objekt, textFeld } from "../validierung";

export const STANDORT_NAME_MAX = 80;

export interface Standort {
  readonly id: string;
  readonly nutzerId: string;
  readonly name: string;
}

/** Port der Persistenz; der Adapter (TE-02) setzt Eindeutigkeit je Nutzer durch. */
export interface StandortSpeicher {
  anlegen(nutzerId: string, name: string): Promise<Standort | "name_vergeben">;
}

const eingabeSchema = objekt({ name: textFeld("name", { min: 1, max: STANDORT_NAME_MAX }) });

/** Beispieloperation (TE-04): zeigt Validierung, Zugriff, Idempotenz und Fehlercodes. Echte Fachlogik folgt in BES. */
export const standortAnlegen = (speicher: StandortSpeicher) =>
  definiereOperation({
    name: "standort.anlegen",
    schema: eingabeSchema,
    ausfuehren: async (kontext, eingabe) => {
      const r = await speicher.anlegen(kontext.nutzerId, eingabe.name);
      return r === "name_vergeben" ? fehlgeschlagen(fehler("standort.name_vergeben")) : ok(r);
    },
  });
