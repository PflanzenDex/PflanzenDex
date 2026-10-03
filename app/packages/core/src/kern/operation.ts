import { fehler, type Fehler } from "./fehler";
import { fehlgeschlagen, ok, type Ergebnis } from "./ergebnis";
import { kanonisch } from "./kanonisch";
import type {
  AngemeldeterKontext,
  IdempotenzSchluessel,
  IdempotenzSpeicher,
  Kontext,
} from "./ports";
import type { Schema } from "./validierung";

export interface Operation<E, A> {
  /** `<domäne>.<verb>`, z. B. `standort.anlegen`. */
  readonly name: string;
  readonly schema: Schema<E>;
  /** Zusätzliche Berechtigung (z. B. Besitz); die Anmeldung prüft die Schicht immer. */
  readonly berechtigt?: (kontext: AngemeldeterKontext, eingabe: E) => Promise<boolean>;
  /** Schreibt nur hier, nur mit geprüfter Eingabe. Fachliche Fehler als `fehlgeschlagen(...)` zurückgeben. */
  readonly ausfuehren: (kontext: AngemeldeterKontext, eingabe: E) => Promise<Ergebnis<A>>;
}

export interface Abhaengigkeiten {
  readonly idempotenz: IdempotenzSpeicher;
}

export interface Aufruf {
  readonly kontext: Kontext;
  readonly eingabe: unknown;
  readonly idempotenzSchluessel: string | undefined;
}

export const definiereOperation = <E, A>(op: Operation<E, A>): Operation<E, A> => op;

async function zugriff<E, A>(
  op: Operation<E, A>,
  kontext: Kontext,
  eingabe: E,
): Promise<Ergebnis<AngemeldeterKontext>> {
  if (kontext.nutzerId === null) return fehlgeschlagen(fehler("zugriff.nicht_angemeldet"));
  const angemeldet: AngemeldeterKontext = { ...kontext, nutzerId: kontext.nutzerId };
  if (op.berechtigt && !(await op.berechtigt(angemeldet, eingabe))) {
    return fehlgeschlagen(fehler("zugriff.verweigert"));
  }
  return ok(angemeldet);
}

async function ausfuehrenGeschuetzt<E, A>(
  op: Operation<E, A>,
  deps: Abhaengigkeiten,
  schluessel: IdempotenzSchluessel,
  kontext: AngemeldeterKontext,
  eingabe: E,
): Promise<Ergebnis<A>> {
  let ergebnis: Ergebnis<A>;
  try {
    ergebnis = await op.ausfuehren(kontext, eingabe);
  } catch (ursache) {
    await deps.idempotenz.verwerfe(schluessel);
    return fehlgeschlagen(fehler("system.unerwartet", { ursache }));
  }
  if (!ergebnis.ok) {
    await deps.idempotenz.verwerfe(schluessel);
    return ergebnis;
  }
  await deps.idempotenz.schliesse(schluessel, ergebnis.wert);
  return ergebnis;
}

const BEGINN_FEHLER: Record<"laeuft" | "konflikt", Fehler> = {
  laeuft: fehler("idempotenz.laeuft_noch"),
  konflikt: fehler("idempotenz.schluessel_konflikt"),
};

/**
 * Einziger Weg für Schreibzugriffe (P-03, AB-3). Reihenfolge: Eingabe prüfen, Zugriff prüfen,
 * Idempotenz-Schlüssel reservieren, ausführen. Scheitert ein früherer Schritt, wird nichts geschrieben.
 */
export async function fuehreAus<E, A>(
  op: Operation<E, A>,
  deps: Abhaengigkeiten,
  aufruf: Aufruf,
): Promise<Ergebnis<A>> {
  const eingabe = op.schema(aufruf.eingabe);
  if (!eingabe.ok) return eingabe;
  const berechtigt = await zugriff(op, aufruf.kontext, eingabe.wert);
  if (!berechtigt.ok) return berechtigt;
  if (!aufruf.idempotenzSchluessel) return fehlgeschlagen(fehler("idempotenz.schluessel_fehlt"));
  const schluessel: IdempotenzSchluessel = {
    nutzerId: berechtigt.wert.nutzerId,
    operation: op.name,
    schluessel: aufruf.idempotenzSchluessel,
  };
  const beginn = await deps.idempotenz.beginne(schluessel, kanonisch(eingabe.wert));
  if (beginn.art === "wiederholung") return ok(beginn.ergebnis as A);
  if (beginn.art !== "neu") return fehlgeschlagen(BEGINN_FEHLER[beginn.art]);
  return ausfuehrenGeschuetzt(op, deps, schluessel, berechtigt.wert, eingabe.wert);
}
