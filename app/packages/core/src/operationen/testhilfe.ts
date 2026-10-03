import type { Beginn, IdempotenzSchluessel, IdempotenzSpeicher } from "./ports";
import type { Standort, StandortSpeicher } from "./beispiel";

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
