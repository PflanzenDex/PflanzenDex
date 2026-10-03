// Standorte und Lichtzonen (US-LIC-05). Ports für die Persistenz; Adapter liegen in `db` (AB-1).

export const STANDORT_ARTEN = ["innen", "aussen"] as const;
export type StandortArt = (typeof STANDORT_ARTEN)[number];

/** Grenzen sind Annahmen (Startwerte): Sonnenlicht liegt bei etwa 100.000 bis 130.000 Lux, 2.000 µmol/m²/s PPFD. */
export const GRENZEN = {
  name: { min: 1, max: 60 },
  luxDecke: { min: 1, max: 200_000 },
  ppfd: { min: 1, max: 3_000 },
  reihenfolge: { min: 0, max: 999 },
} as const;

export interface Lichtzone {
  readonly id: string;
  readonly name: string;
  readonly luxDecke: number;
  readonly ppfd: number | null;
  readonly reihenfolge: number;
}

/** `reihenfolge: null` hängt die Zone ans Ende der bestehenden an. */
export interface ZonenWerte {
  readonly name: string;
  readonly luxDecke: number;
  readonly ppfd: number | null;
  readonly reihenfolge: number | null;
}

export interface LichtStandort {
  readonly id: string;
  readonly name: string;
  readonly lichtzoneId: string | null;
  readonly art: StandortArt;
}

export interface StandortWerte {
  readonly name: string;
  readonly lichtzoneId: string | null;
  readonly art: StandortArt;
}

/** Jeder Aufruf gilt nur für das Konto `nutzerId` (P-04); Namen sind je Konto eindeutig. */
export interface ZonenSpeicher {
  liste(nutzerId: string): Promise<readonly Lichtzone[]>;
  anlegen(nutzerId: string, werte: ZonenWerte): Promise<Lichtzone | "name_vergeben">;
  aendern(
    nutzerId: string,
    id: string,
    werte: ZonenWerte,
  ): Promise<Lichtzone | "name_vergeben" | "nicht_gefunden">;
  /** `in_benutzung` meldet der Adapter zusätzlich als Rückfall (Fremdschlüssel), falls eine Nutzung neu entstand. */
  loeschen(nutzerId: string, id: string): Promise<"geloescht" | "nicht_gefunden" | "in_benutzung">;
}

export interface LichtStandortSpeicher {
  liste(nutzerId: string): Promise<readonly LichtStandort[]>;
  anlegen(
    nutzerId: string,
    werte: StandortWerte,
  ): Promise<LichtStandort | "name_vergeben" | "zone_unbekannt">;
  aendern(
    nutzerId: string,
    id: string,
    werte: StandortWerte,
  ): Promise<LichtStandort | "name_vergeben" | "nicht_gefunden" | "zone_unbekannt">;
}

export type ZonenNutzerArt = "standort" | "exemplar" | "art";

export interface ZonenNutzer {
  readonly art: ZonenNutzerArt;
  readonly id: string;
  readonly name: string;
}

/**
 * Port „Nutzung der Zone“: Jede Quelle nennt, wer eine Zone belegt. Standorte liefert `db`. Arten und Exemplare
 * verlinken (noch) keine Zone; sobald ein Feld des Moduls `bestand` auf eine Zone zeigt (BES-04, BES-09), setzt
 * `bestand` diesen Port für seine Tabelle um, sonst bliebe die Nutzung beim Löschen unbemerkt.
 */
export interface ZonenNutzung {
  nutzer(nutzerId: string, lichtzoneId: string): Promise<readonly ZonenNutzer[]>;
}
