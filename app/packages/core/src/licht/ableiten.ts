import { fehlgeschlagen, ganzzahlFeld, objekt, ok, type Ergebnis } from "../kern";
import type { Lichtzone } from "./typen";

/** Hochstufen ab 80 % der Lux-Decke der aktuellen Stufe, Verbleib bei mehr als 30 % Abstand zur Decke der nächsten (US-LIC-01). */
export const HOCHSTUFEN_AB = { zaehler: 8, nenner: 10 } as const;
export const ABSTAND_MAX = { zaehler: 7, nenner: 10 } as const;

export interface AbleitungsEingabe {
  /** Lux-Bedarf für maximales Wachstum (Sättigungspunkt); `null` = unbekannt (P-08). */
  readonly lichtbedarfLux: number | null;
  /** Standard-Stufe 2–4 der Voreinstellung (Katalog). */
  readonly standardStufe: number;
  /** C3-Pflanze mit weichem Blatt („sonnenliebend“): wird nicht automatisch hochgestuft. */
  readonly weichesBlatt: boolean;
}

export type AbleitungsGrund =
  | "standard"
  | "hochgestuft"
  | "bedarf_zu_niedrig_fuer_hoehere_zone"
  | "weiches_blatt"
  | "oberste_zone";

export type Ableitung =
  | {
      readonly art: "zone";
      readonly zone: Lichtzone;
      /** Position unter den Zonen des Kontos, 1 = Stecklingslicht (nie Ziel). */
      readonly stufe: number;
      readonly grund: AbleitungsGrund;
    }
  | { readonly art: "unbekannt"; readonly grund: "kein_bedarf" | "keine_erwachsenenzone" };

const erreicht = (bedarf: number, decke: number, f: { zaehler: number; nenner: number }) =>
  bedarf * f.nenner >= decke * f.zaehler;

/**
 * Leitet die Lichtzone einer Art aus dem Lux-Bedarf und den Zonen des Kontos ab (FR-BES-10), live und ohne zu
 * speichern (P-01). Die niedrigste Zone ist Stecklingslicht und nie Ziel für Erwachsene. Ohne Bedarf bleibt die
 * Zone „unbekannt“ (FR-LIC-03); hat das Konto weniger Zonen als die Standard-Stufe, gilt die höchste vorhandene.
 */
export function zoneAbleiten(eingabe: AbleitungsEingabe, zonen: readonly Lichtzone[]): Ableitung {
  const erwachsene = [...zonen].sort((a, b) => a.reihenfolge - b.reihenfolge).slice(1);
  const bedarf = eingabe.lichtbedarfLux;
  if (bedarf === null) return { art: "unbekannt", grund: "kein_bedarf" };
  if (erwachsene.length === 0) return { art: "unbekannt", grund: "keine_erwachsenenzone" };

  const start = Math.min(Math.max(eingabe.standardStufe - 2, 0), erwachsene.length - 1);
  let i = start;
  let grund: AbleitungsGrund = "standard";
  for (let n = erwachsene[i + 1]; n; n = erwachsene[i + 1]) {
    const schritt = naechsterSchritt(eingabe, bedarf, erwachsene[i] as Lichtzone, n);
    if (schritt !== "hochgestuft") {
      grund = schritt;
      break;
    }
    i += 1;
    grund = schritt;
  }
  if (i === start && grund === "bedarf_zu_niedrig_fuer_hoehere_zone") grund = "standard";
  if (!erwachsene[i + 1] && i === start) grund = "oberste_zone";
  return { art: "zone", zone: erwachsene[i] as Lichtzone, stufe: i + 2, grund };
}

function naechsterSchritt(
  eingabe: AbleitungsEingabe,
  bedarf: number,
  aktuell: Lichtzone,
  naechste: Lichtzone,
): "hochgestuft" | "weiches_blatt" | "bedarf_zu_niedrig_fuer_hoehere_zone" {
  if (eingabe.weichesBlatt) return "weiches_blatt";
  const passt =
    erreicht(bedarf, aktuell.luxDecke, HOCHSTUFEN_AB) &&
    erreicht(bedarf, naechste.luxDecke, ABSTAND_MAX);
  return passt ? "hochgestuft" : "bedarf_zu_niedrig_fuer_hoehere_zone";
}

const eingabeSchema = objekt({
  lichtbedarfLux: ganzzahlFeld("lichtbedarfLux", { min: 1, max: 200_000 }),
  standardStufe: ganzzahlFeld("standardStufe", { min: 2, max: 4 }),
});

/** Prüft rohe Angaben (z. B. aus der Anfrage) und leitet dann die Zone ab; ungültige Angaben liefern `eingabe.ungueltig`. */
export function zoneAbleitenGeprueft(
  roh: { lichtbedarfLux: unknown; standardStufe: unknown; weichesBlatt?: boolean },
  zonen: readonly Lichtzone[],
): Ergebnis<Ableitung> {
  const r = eingabeSchema(roh);
  if (!r.ok) return fehlgeschlagen(r.fehler);
  return ok(zoneAbleiten({ ...r.wert, weichesBlatt: roh.weichesBlatt === true }, zonen));
}
