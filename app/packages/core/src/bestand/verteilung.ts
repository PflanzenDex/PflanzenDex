// Verteilung der Exemplare auf die Lichtzonen (US-LIC-02, FR-LIC-04). Platzhalter für den roten Test.
import type { LichtStandortSpeicher, Lichtzone, ZonenSpeicher } from "../licht";
import type { ArtQuelle, ExemplarSpeicher } from "./typen";

export interface ZonenZaehlung {
  readonly zone: Lichtzone;
  readonly anzahl: number;
}

export interface NichtGezaehlt {
  readonly stecklingslicht: number;
  readonly archiviert: number;
  readonly zoneUnbekannt: number;
}

export interface Verteilung {
  readonly zonen: readonly ZonenZaehlung[];
  readonly duennste: readonly Lichtzone[];
  readonly nichtGezaehlt: NichtGezaehlt;
  readonly hinweis: { readonly text: string; readonly naechsteHandlung: string };
}

export interface VerteilungsAbhaengigkeiten {
  readonly exemplare: ExemplarSpeicher;
  readonly arten: ArtQuelle;
  readonly standorte: LichtStandortSpeicher;
  readonly zonen: ZonenSpeicher;
}

export async function zonenVerteilung(
  deps: VerteilungsAbhaengigkeiten,
  nutzerId: string,
): Promise<Verteilung> {
  void [deps, nutzerId];
  return {
    zonen: [],
    duennste: [],
    nichtGezaehlt: { stecklingslicht: 0, archiviert: 0, zoneUnbekannt: 0 },
    hinweis: { text: "", naechsteHandlung: "" },
  };
}
