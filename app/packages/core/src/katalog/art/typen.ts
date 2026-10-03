// Artenkatalog (US-BES-01, DM-BES-01). Ports für die Persistenz; Adapter liegen in `db` (AB-1).
import type { Pruefstatus } from "../typen";

export const WACHSTUMSMASSE = ["hoehe", "rosettendurchmesser", "trieblaenge"] as const;
export type Wachstumsmass = (typeof WACHSTUMSMASSE)[number];

/** Grenzen sind Annahmen (Startwerte), außer Schwierigkeit 1–3 und Standard-Stufe 2–4 aus DM-BES-01. */
export const ART_GRENZEN = {
  schwierigkeit: { min: 1, max: 3 },
  standardStufe: { min: 2, max: 4 },
  lichtbedarfLux: { min: 1, max: 200_000 },
  name: { min: 2, max: 120 },
  kurz: { min: 1, max: 200 },
  lang: { min: 1, max: 1000 },
  synonyme: 20,
} as const;

export type NamensFeld = "lateinisch" | "deutsch" | "englisch" | "synonym";

/** Ein Name der Art mit Schlüssel für Suche und Dublettenprüfung. */
export interface ArtName {
  readonly feld: NamensFeld;
  readonly anzeige: string;
  readonly norm: string;
}

/** Alle Angaben, die der Ersteller macht; `null` heißt „unbekannt“ (P-08). */
export interface ArtWerte {
  readonly lateinischerName: string;
  readonly gattung: string;
  readonly epitheton: string | null;
  readonly sorte: string | null;
  readonly deutscherName: string | null;
  readonly englischerName: string | null;
  readonly synonyme: readonly string[];
  readonly familieDeutsch: string | null;
  readonly familieLateinisch: string | null;
  readonly schwierigkeit: number;
  readonly standardStufe: number;
  readonly lichtbedarfLux: number;
  /** Monat-Tag `MM-TT`; beide oder keiner. */
  readonly ruheVon: string | null;
  readonly ruheBis: string | null;
  readonly standortHinweis: string | null;
  readonly wachstumsmass: Wachstumsmass;
  readonly vergeilungAnzeichen: string;
  readonly giesshinweis: string | null;
  readonly substrat: string | null;
  readonly rueckschnitt: string | null;
  readonly wuchsHacks: string | null;
  readonly erfolgskriterien: string;
  readonly botanischeStory: string | null;
  readonly quelle: string | null;
}

export interface Art extends ArtWerte {
  readonly id: string;
  readonly pruefstatus: Pruefstatus;
  readonly erstelltVon: "betreiber" | "pruefer" | "nutzer";
  /** Der Aufrufer hat die Art erstellt. */
  readonly eigener: boolean;
  readonly version: number;
}

export interface ArtTreffer extends Art {
  /** Worüber die Suche die Art fand; bei leerer Suche `null`. */
  readonly treffer: { readonly feld: NamensFeld; readonly anzeige: string } | null;
}

export type ArtAnlage = { readonly art: "neu" | "dublette"; readonly wert: Art };

/**
 * Port der Persistenz. Alle Aufrufe gelten für das Konto `nutzerId` und liefern nur, was es sehen darf
 * (eigene Vorschläge und freigegebene Arten, FR-BES-11); der Adapter erzwingt das zusätzlich per Zeilenregel.
 */
export interface ArtSpeicher {
  /** `norm`: normierter Suchtext, `null` listet alle sichtbaren Arten. */
  suche(nutzerId: string, norm: string | null): Promise<readonly ArtTreffer[]>;
  finde(nutzerId: string, id: string): Promise<Art | null>;
  /**
   * Prüft Dubletten unter den sichtbaren Arten und legt Art, Namen und Prüfvorgang (`vorschlag`) in einem
   * Schritt an (FR-BES-03: kein Teilzustand). Bei einer Dublette wird nichts geschrieben.
   */
  anlegen(nutzerId: string, werte: ArtWerte, namen: readonly ArtName[]): Promise<ArtAnlage>;
}
