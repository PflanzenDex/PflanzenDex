// Ports für Persistenz: `core` definiert nur die Schnittstellen, Adapter (z. B. Postgres, TE-02) liegen außerhalb (AB-1).

/** Mandantengebunden (P-04): derselbe Schlüssel zweier Nutzer ist nie derselbe Eintrag. */
export interface IdempotenzSchluessel {
  readonly nutzerId: string;
  readonly operation: string;
  readonly schluessel: string;
}

export type Beginn =
  | { readonly art: "neu" }
  | { readonly art: "wiederholung"; readonly ergebnis: unknown }
  | { readonly art: "laeuft" }
  | { readonly art: "konflikt" };

/**
 * Adapter müssen `beginne` atomar umsetzen (z. B. Unique-Constraint): Von zwei gleichzeitigen Aufrufen
 * mit demselben Schlüssel bekommt genau einer `neu`. `fingerabdruck` ist die kanonische Eingabe;
 * ein Ergebnis muss serialisierbar (JSON) sein. Aufbewahrungsdauer der Schlüssel ist Sache des Adapters.
 */
export interface IdempotenzSpeicher {
  beginne(schluessel: IdempotenzSchluessel, fingerabdruck: string): Promise<Beginn>;
  schliesse(schluessel: IdempotenzSchluessel, ergebnis: unknown): Promise<void>;
  /** Gibt den Schlüssel frei, wenn die Operation scheiterte, damit eine Wiederholung möglich bleibt. */
  verwerfe(schluessel: IdempotenzSchluessel): Promise<void>;
}

/** Wer ruft auf? Web, Jobs und KI-Schnittstelle bauen denselben Kontext (AB-3). */
export interface Kontext {
  readonly nutzerId: string | null;
}

export type AngemeldeterKontext = Kontext & { readonly nutzerId: string };
