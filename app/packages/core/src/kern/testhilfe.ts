import type { Beginn, IdempotenzSchluessel, IdempotenzSpeicher } from "./ports";
import { definiereOperation } from "./operation";
import { fehler } from "./fehler";
import { fehlgeschlagen, ok } from "./ergebnis";
import { objekt, textFeld } from "./validierung";

const id = (s: IdempotenzSchluessel) => JSON.stringify([s.nutzerId, s.operation, s.schluessel]);

/** In-Memory-Adapter nur für Tests; der echte Adapter kommt mit TE-02. */
export class SpeicherImSpeicher implements IdempotenzSpeicher {
  private readonly eintraege = new Map<
    string,
    { fingerabdruck: string; ergebnis?: unknown; fertig: boolean }
  >();

  async beginne(schluessel: IdempotenzSchluessel, fingerabdruck: string): Promise<Beginn> {
    const vorhanden = this.eintraege.get(id(schluessel));
    if (!vorhanden) {
      this.eintraege.set(id(schluessel), { fingerabdruck, fertig: false });
      return { art: "neu" };
    }
    if (vorhanden.fingerabdruck !== fingerabdruck) return { art: "konflikt" };
    return vorhanden.fertig
      ? { art: "wiederholung", ergebnis: vorhanden.ergebnis }
      : { art: "laeuft" };
  }

  async schliesse(schluessel: IdempotenzSchluessel, ergebnis: unknown): Promise<void> {
    const e = this.eintraege.get(id(schluessel));
    if (e) Object.assign(e, { ergebnis, fertig: true });
  }

  async verwerfe(schluessel: IdempotenzSchluessel): Promise<void> {
    this.eintraege.delete(id(schluessel));
  }
}

export class StandorteImSpeicher implements StandortSpeicher {
  readonly zeilen: Standort[] = [];
  schreibzugriffe = 0;

  async anlegen(nutzerId: string, name: string): Promise<Standort | "name_vergeben"> {
    this.schreibzugriffe += 1;
    if (this.zeilen.some((s) => s.nutzerId === nutzerId && s.name === name)) return "name_vergeben";
    const standort = { id: `s${this.zeilen.length + 1}`, nutzerId, name };
    this.zeilen.push(standort);
    return standort;
  }
}

// Demo-Operation (TE-04), nur für Tests der Operations-Engine; kein Produktcode.
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
