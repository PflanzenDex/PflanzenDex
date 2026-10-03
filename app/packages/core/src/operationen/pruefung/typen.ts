// Rollen und Prüfstatus des gemeinsamen Katalogs (TE-08, FR-BES-02, FR-BES-06, FR-BES-14, E-02).

/** Rollen eines Kontos. Betreiber ist zunächst der einzige Prüfer; weitere Prüfer sind eine eigene Rolle. */
export type Rolle = "betreiber" | "pruefer";

/**
 * `vorschlag` und `ki_ungeprueft` entstehen durch Nutzer, `kuratiert` durch einen Betreiber-Batch,
 * `geprueft` und `zurueckgewiesen` nur durch einen Prüfer.
 */
export type Pruefstatus =
  "vorschlag" | "ki_ungeprueft" | "kuratiert" | "geprueft" | "zurueckgewiesen";

export const VORSCHLAG_STATUS = ["vorschlag", "ki_ungeprueft"] as const;
export const ENTSCHEIDUNGS_STATUS = ["geprueft", "zurueckgewiesen"] as const;
/** Offene Vorgänge: nur sie lassen sich entscheiden. */
export const OFFEN: readonly Pruefstatus[] = ["vorschlag", "ki_ungeprueft"];
export const GRUND_MAX = 500;

export interface Pruefvorgang {
  readonly id: string;
  /** Konto des Erstellers; nur dieses sieht den Inhalt, solange er nicht freigegeben ist (FR-BES-11). */
  readonly erstellerId: string;
  /** Art des Katalogobjekts, z. B. `art` (entsteht mit BES-01); der Mechanismus kennt seinen Inhalt nicht. */
  readonly objektArt: string;
  readonly objektId: string;
  readonly status: Pruefstatus;
  readonly grund: string | null;
  readonly geprueftVon: string | null;
}

/** Port der Persistenz (Adapter in `db`). Der Adapter erzwingt die Rechte zusätzlich per Zeilenregel und Auslöser. */
export interface PruefungSpeicher {
  /** Rollen des angemeldeten Kontos (leer = Pflanzenhalter). */
  rollen(nutzerId: string): Promise<readonly Rolle[]>;
  /** `vorhanden`, wenn für das Objekt schon ein Vorgang besteht. */
  anlegen(
    nutzerId: string,
    vorgang: { objektArt: string; objektId: string; status: Pruefstatus },
  ): Promise<Pruefvorgang | "vorhanden">;
  /** Prüfer finden Vorgänge aller Konten (nur die Metadaten, nie den Inhalt, P-04), andere nur ihre eigenen. */
  finde(nutzerId: string, id: string): Promise<Pruefvorgang | null>;
  entscheide(
    nutzerId: string,
    id: string,
    status: "geprueft" | "zurueckgewiesen",
    grund: string | null,
  ): Promise<Pruefvorgang | null>;
}
